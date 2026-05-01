from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime
import uuid


class Document(BaseModel):
    id: str = ""
    name: str
    file_type: str
    size_bytes: int
    visibility: Literal["public", "private"]
    session_id: Optional[str] = None
    status: Literal["processing", "ready", "failed"] = "processing"
    upload_time: datetime = None
    file_path: str = ""
    error_message: Optional[str] = None

    def __init__(self, **data):
        if not data.get("id"):
            data["id"] = str(uuid.uuid4())
        if not data.get("upload_time"):
            data["upload_time"] = datetime.utcnow()
        super().__init__(**data)


class DocumentResponse(BaseModel):
    id: str
    name: str
    file_type: str
    size_bytes: int
    visibility: Literal["public", "private"]
    status: Literal["processing", "ready", "failed"]
    upload_time: datetime
    error_message: Optional[str] = None


class Citation(BaseModel):
    document_id: str
    document_name: str
    page_number: Optional[int] = None
    excerpt: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[ChatMessage] = []
    document_ids: list[str] = []  # empty = search all accessible docs


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation] = []
