"""RAG query engine — retrieves chunks and generates grounded answers."""
from typing import List
from app.core.config import settings
from app.models.document import ChatMessage, ChatResponse, Citation
from app.services import parser, storage, vector_store

_SYSTEM_PROMPT = """You are a document intelligence assistant.
You MUST answer questions exclusively using the provided document excerpts below.
Do NOT use any knowledge outside of the provided excerpts.
If the answer is not found in the excerpts, respond with exactly:
"I could not find relevant information in the uploaded documents."

Always cite your sources using the format: [Document: <name>, Page: <number>]
Be thorough, accurate, and helpful. When comparing or summarizing across multiple documents, clearly attribute each fact."""


def _build_context(chunks: List[dict]) -> str:
    if not chunks:
        return ""
    lines = ["--- DOCUMENT EXCERPTS ---"]
    for i, chunk in enumerate(chunks, 1):
        page = f", Page {chunk['page_number']}" if chunk.get("page_number") else ""
        lines.append(
            f"\n[Excerpt {i}] Source: {chunk['document_name']}{page}\n{chunk['text']}"
        )
    lines.append("\n--- END OF EXCERPTS ---")
    return "\n".join(lines)


def _build_fallback_answer(question: str, chunks: List[dict]) -> str:
    if not chunks:
        return "I could not find relevant information in the uploaded documents."

    top = chunks[0]
    excerpt = top["text"].strip()
    if len(excerpt) > 800:
        excerpt = excerpt[:800].rstrip() + "..."

    page = f" page {top['page_number']}" if top.get("page_number") else ""
    return (
        f"The uploaded documents appear to mention this on {top['document_name']}{page}: "
        f"{excerpt}"
    )


def _repair_index(session_id: str, document_ids: List[str]) -> None:
    docs = storage.list_documents(session_id)
    if document_ids:
        docs = [doc for doc in docs if doc.id in document_ids]

    for doc in docs:
        if not doc.file_path:
            continue
        try:
            pages = parser.extract_text(doc.file_path, doc.file_type)
            vector_store.index_document(
                doc_id=doc.id,
                doc_name=doc.name,
                pages=pages,
                visibility=doc.visibility,
                session_id=doc.session_id,
            )
        except Exception:
            continue


def answer(
    question: str,
    history: List[ChatMessage],
    session_id: str,
    document_ids: List[str],
) -> ChatResponse:
    from openai import OpenAI

    # 1. Retrieve the best available chunks from uploaded files.
    chunks = vector_store.query(
        question=question,
        session_id=session_id,
        document_ids=document_ids,
        n_results=12,
    )

    if not chunks:
        _repair_index(session_id, document_ids)
        chunks = vector_store.query(
            question=question,
            session_id=session_id,
            document_ids=document_ids,
            n_results=12,
        )

    # Use the returned chunks directly. The old threshold dropped good matches
    # for semantically-related questions, especially when exact wording differed.
    relevant = chunks
    context = _build_context(relevant)
    if not context:
        return ChatResponse(
            answer=_build_fallback_answer(question, relevant),
            citations=[],
        )

    # 2. Build prompt messages
    messages = [{"role": "system", "content": _SYSTEM_PROMPT}]

    # Include up to last 6 history turns
    for msg in history[-6:]:
        messages.append({"role": msg.role, "content": msg.content})

    user_content = question
    if context:
        user_content = f"{context}\n\nQuestion: {question}"

    messages.append({"role": "user", "content": user_content})

    # 3. Call the model, but fall back to a grounded extractive answer if the
    # request fails for any reason.
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=messages,
            temperature=0.1,
            max_tokens=2048,
        )
        answer_text = response.choices[0].message.content.strip()
    except Exception:
        answer_text = _build_fallback_answer(question, relevant)

    # 4. Build citations from relevant chunks (deduplicate by doc+page)
    citations = []
    seen = set()
    for chunk in relevant:
        key = (chunk["document_id"], chunk.get("page_number"))
        if key not in seen:
            seen.add(key)
            citations.append(
                Citation(
                    document_id=chunk["document_id"],
                    document_name=chunk["document_name"],
                    page_number=chunk.get("page_number"),
                    excerpt=chunk["text"][:300] + ("..." if len(chunk["text"]) > 300 else ""),
                )
            )

    return ChatResponse(answer=answer_text, citations=citations)
