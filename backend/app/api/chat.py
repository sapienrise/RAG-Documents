"""Chat endpoint."""
from fastapi import APIRouter, Request, Response, HTTPException
from app.core.session import get_session_id, set_session_cookie, get_actor_id
from app.core.auth import require_user
from app.core.config import settings
from app.models.document import ChatRequest, ChatResponse
from app.services import rag, credits

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/query", response_model=ChatResponse)
async def chat_query(
    payload: ChatRequest,
    request: Request,
    response: Response,
):
    require_user(request)
    session_id = get_session_id(request)
    actor_id = get_actor_id(request)
    set_session_cookie(response, session_id)

    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    charged = credits.charge_usage(
        actor_id=actor_id,
        operation="chat_query",
        credits_charged=settings.chat_query_credit_cost,
        metadata='{"source":"chat.query"}',
    )
    if not charged:
        balance = credits.get_credit_balance(actor_id)
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits. Balance: {balance}, required: {settings.chat_query_credit_cost}",
        )

    result = rag.answer(
        question=payload.question,
        history=payload.history,
        session_id=actor_id,
        document_ids=payload.document_ids,
    )
    return result
