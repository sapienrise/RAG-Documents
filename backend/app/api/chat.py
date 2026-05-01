"""Chat endpoint."""
from fastapi import APIRouter, Request, Response, HTTPException
from app.core.session import get_session_id, set_session_cookie
from app.models.document import ChatRequest, ChatResponse
from app.services import rag

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/query", response_model=ChatResponse)
async def chat_query(
    payload: ChatRequest,
    request: Request,
    response: Response,
):
    session_id = get_session_id(request)
    set_session_cookie(response, session_id)

    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    result = rag.answer(
        question=payload.question,
        history=payload.history,
        session_id=session_id,
        document_ids=payload.document_ids,
    )
    return result
