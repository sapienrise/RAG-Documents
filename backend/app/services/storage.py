"""Simple JSON-file-based document metadata store."""
import json
import os
from typing import Optional
from filelock import FileLock
from app.models.document import Document
from app.core.config import settings

_DB_PATH = os.path.join(settings.storage_dir, "documents.json")
_LOCK_PATH = _DB_PATH + ".lock"


def _load() -> dict:
    if not os.path.exists(_DB_PATH):
        return {}
    with open(_DB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(data: dict) -> None:
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    with open(_DB_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, default=str, indent=2)


def upsert_document(doc: Document) -> None:
    with FileLock(_LOCK_PATH):
        data = _load()
        data[doc.id] = doc.model_dump()
        _save(data)


def get_document(doc_id: str) -> Optional[Document]:
    data = _load()
    raw = data.get(doc_id)
    return Document(**raw) if raw else None


def list_documents(session_id: str) -> list[Document]:
    data = _load()
    docs = []
    for raw in data.values():
        doc = Document(**raw)
        if doc.visibility == "public" or doc.session_id == session_id:
            docs.append(doc)
    docs.sort(key=lambda d: d.upload_time, reverse=True)
    return docs


def delete_document(doc_id: str) -> Optional[Document]:
    with FileLock(_LOCK_PATH):
        data = _load()
        raw = data.pop(doc_id, None)
        if raw:
            _save(data)
            return Document(**raw)
    return None
