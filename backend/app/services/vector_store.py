"""Vector store with ChromaDB support and a file-based fallback."""
import json
import math
import os
import re
from typing import List, Tuple, Optional, TYPE_CHECKING
from app.core.config import settings

if TYPE_CHECKING:
    import chromadb
    from openai import OpenAI

_client: Optional["chromadb.PersistentClient"] = None
_openai: Optional["OpenAI"] = None
COLLECTION_NAME = "document_chunks"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
_FALLBACK_DB_PATH = os.path.join(settings.chroma_persist_dir, "fallback_chunks.json")


def _get_chroma():
    import chromadb
    from chromadb.config import Settings as ChromaSettings

    global _client
    if _client is None:
        os.makedirs(settings.chroma_persist_dir, exist_ok=True)
        _client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _client.get_or_create_collection(
        COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def _get_openai():
    from openai import OpenAI

    global _openai
    if _openai is None:
        _openai = OpenAI(api_key=settings.openai_api_key)
    return _openai


def _embed(texts: List[str]) -> List[List[float]]:
    client = _get_openai()
    response = client.embeddings.create(
        model=settings.openai_embedding_model,
        input=texts,
    )
    return [item.embedding for item in response.data]


def _chunk_text(text: str) -> List[str]:
    """Split text into overlapping chunks (~CHUNK_SIZE tokens each)."""
    words = text.split()
    approx_chunk_words = CHUNK_SIZE * 4 // 5
    overlap_words = CHUNK_OVERLAP * 4 // 5
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i: i + approx_chunk_words])
        chunks.append(chunk)
        i += approx_chunk_words - overlap_words
        if i >= len(words):
            break
    return chunks or [text]


def _fallback_load() -> list[dict]:
    if not os.path.exists(_FALLBACK_DB_PATH):
        return []
    with open(_FALLBACK_DB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _fallback_save(rows: list[dict]) -> None:
    os.makedirs(settings.chroma_persist_dir, exist_ok=True)
    with open(_FALLBACK_DB_PATH, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=True, indent=2)


def _supports_chroma() -> bool:
    try:
        import chromadb  # noqa: F401

        return True
    except Exception:
        return False


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _fallback_distance(question: str, chunk: str) -> float:
    q_tokens = _tokenize(question)
    c_tokens = _tokenize(chunk)
    if not q_tokens or not c_tokens:
        return 1.0

    overlap = len(q_tokens & c_tokens)
    if overlap == 0:
        return 1.0

    score = overlap / math.sqrt(len(q_tokens) * len(c_tokens))
    return max(0.0, 1.0 - score)


def index_document(
    doc_id: str,
    doc_name: str,
    pages: List[Tuple[int, str]],
    visibility: str,
    session_id: Optional[str],
) -> None:
    ids, documents, metadatas = [], [], []

    for page_num, text in pages:
        chunks = _chunk_text(text)
        for chunk_idx, chunk in enumerate(chunks):
            if not chunk.strip():
                continue
            chunk_id = f"{doc_id}_p{page_num}_c{chunk_idx}"
            ids.append(chunk_id)
            documents.append(chunk)
            metadatas.append(
                {
                    "document_id": doc_id,
                    "document_name": doc_name,
                    "page_number": page_num,
                    "visibility": visibility,
                    "session_id": session_id or "",
                    "chunk_index": chunk_idx,
                }
            )

    if not ids:
        return

    if _supports_chroma():
        collection = _get_chroma()
        batch_size = 100
        for i in range(0, len(ids), batch_size):
            batch_ids = ids[i: i + batch_size]
            batch_docs = documents[i: i + batch_size]
            batch_meta = metadatas[i: i + batch_size]
            embeddings = _embed(batch_docs)
            collection.add(
                ids=batch_ids,
                embeddings=embeddings,
                documents=batch_docs,
                metadatas=batch_meta,
            )
        return

    rows = _fallback_load()
    rows = [row for row in rows if row["document_id"] != doc_id]
    for chunk_id, chunk, meta in zip(ids, documents, metadatas):
        rows.append(
            {
                "id": chunk_id,
                "text": chunk,
                "document_id": meta["document_id"],
                "document_name": meta["document_name"],
                "page_number": meta["page_number"],
                "visibility": meta["visibility"],
                "session_id": meta["session_id"],
                "chunk_index": meta["chunk_index"],
            }
        )
    _fallback_save(rows)


def delete_document(doc_id: str) -> None:
    if _supports_chroma():
        collection = _get_chroma()
        results = collection.get(where={"document_id": doc_id})
        if results["ids"]:
            collection.delete(ids=results["ids"])
        return

    rows = _fallback_load()
    rows = [row for row in rows if row["document_id"] != doc_id]
    _fallback_save(rows)


def query(
    question: str,
    session_id: str,
    document_ids: List[str],
    n_results: int = 8,
) -> List[dict]:
    """
    Returns top-N relevant chunks accessible to the user.
    Filters by: public OR (private AND session_id matches).
    If document_ids provided, further filters to those docs.
    """
    if _supports_chroma():
        collection = _get_chroma()
        q_embedding = _embed([question])[0]

        visibility_filter = {
            "$or": [
                {"visibility": {"$eq": "public"}},
                {
                    "$and": [
                        {"visibility": {"$eq": "private"}},
                        {"session_id": {"$eq": session_id}},
                    ]
                },
            ]
        }

        if document_ids:
            doc_filter = {"document_id": {"$in": document_ids}}
            where = {"$and": [visibility_filter, doc_filter]}
        else:
            where = visibility_filter

        try:
            results = collection.query(
                query_embeddings=[q_embedding],
                n_results=max(n_results * 4, 20),
                where=where,
                include=["documents", "metadatas", "distances"],
            )
        except Exception:
            return []

        chunks = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            if not doc or not doc.strip():
                continue
            chunks.append(
                {
                    "text": doc,
                    "document_id": meta["document_id"],
                    "document_name": meta["document_name"],
                    "page_number": meta.get("page_number"),
                    "distance": dist,
                }
            )
        # Hybrid reranking:
        # 1) semantic relevance from vector distance
        # 2) lexical relevance from token overlap
        # Lower score is better.
        sw = max(0.0, float(settings.semantic_weight))
        lw = max(0.0, float(settings.lexical_weight))
        total = sw + lw
        if total <= 0:
            sw, lw = 0.75, 0.25
            total = 1.0
        sw /= total
        lw /= total

        rescored = []
        for chunk in chunks:
            semantic_score = float(chunk["distance"])
            lexical_score = _fallback_distance(question, chunk["text"])
            hybrid_score = sw * semantic_score + lw * lexical_score
            rescored.append({**chunk, "distance": hybrid_score})

        rescored.sort(key=lambda item: item["distance"])
        return rescored[:n_results]

    rows = _fallback_load()
    visible_rows = []
    for row in rows:
        if row["visibility"] != "public" and row["session_id"] != session_id:
            continue
        if document_ids and row["document_id"] not in document_ids:
            continue
        visible_rows.append(row)

    ranked = sorted(
        (
            {
                "text": row["text"],
                "document_id": row["document_id"],
                "document_name": row["document_name"],
                "page_number": row.get("page_number"),
                "distance": _fallback_distance(question, row["text"]),
            }
            for row in visible_rows
            if row["text"] and row["text"].strip()
        ),
        key=lambda item: item["distance"],
    )
    return ranked[:n_results]
