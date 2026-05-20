import hmac
import hashlib
import json
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import httpx
from app.core.auth import require_user
from app.core.config import settings
from app.core.session import get_actor_id
from app.services import credits

router = APIRouter(prefix="/api/billing", tags=["billing"])


class CreateSubscriptionOrderRequest(BaseModel):
    amount_inr: int | None = None
    credits_to_grant: int | None = None


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/create-order")
async def create_subscription_order(payload: CreateSubscriptionOrderRequest, request: Request):
    user = require_user(request)
    actor_id = get_actor_id(request)
    credits.ensure_tables()
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise HTTPException(status_code=500, detail="Razorpay is not configured")

    amount_inr = payload.amount_inr or settings.subscription_amount_inr
    credits_to_grant = payload.credits_to_grant or settings.subscription_monthly_credits
    if amount_inr <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if credits_to_grant <= 0:
        raise HTTPException(status_code=400, detail="Credits must be positive")
    amount_paise = int(amount_inr * 100)

    body = {
        "amount": amount_paise,
        "currency": "INR",
        "receipt": f"sub_{actor_id[:20]}",
        "notes": {
            "actor_id": actor_id,
            "plan_name": settings.subscription_plan_name,
            "credits_to_grant": str(credits_to_grant),
        },
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.razorpay.com/v1/orders",
            json=body,
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail="Failed to create Razorpay order")
    order = resp.json()
    credits.record_order(
        razorpay_order_id=order["id"],
        actor_id=actor_id,
        credits_to_grant=credits_to_grant,
        amount_inr=amount_inr,
    )
    return {
        "key_id": settings.razorpay_key_id,
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "plan_name": settings.subscription_plan_name,
        "credits_to_grant": credits_to_grant,
        "prefill_email": user.get("email", ""),
        "prefill_name": user.get("name", ""),
    }


@router.post("/verify")
async def verify_subscription_payment(payload: VerifyPaymentRequest, request: Request):
    require_user(request)
    actor_id = get_actor_id(request)
    if not settings.razorpay_key_secret:
        raise HTTPException(status_code=500, detail="Razorpay is not configured")

    message = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode("utf-8")
    expected_signature = hmac.new(
        settings.razorpay_key_secret.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, payload.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    order = credits.get_order(payload.razorpay_order_id)
    if not order:
        raise HTTPException(status_code=400, detail="Order not found for credit grant")
    if order["actor_id"] != actor_id:
        raise HTTPException(status_code=403, detail="Order does not belong to current user")

    credits.grant_subscription_credits(
        actor_id=actor_id,
        razorpay_order_id=payload.razorpay_order_id,
        razorpay_payment_id=payload.razorpay_payment_id,
        credits_to_grant=int(order["credits_to_grant"]),
    )
    balance = credits.get_credit_balance(actor_id)
    return {"success": True, "status": "paid", "credits_balance": balance}


@router.get("/credits")
async def get_credits(request: Request):
    require_user(request)
    actor_id = get_actor_id(request)
    balance = credits.get_credit_balance(actor_id)
    return {"credits_balance": balance, "chat_query_cost": settings.chat_query_credit_cost}


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    if not settings.razorpay_webhook_secret:
        raise HTTPException(status_code=500, detail="Razorpay webhook secret is not configured")

    body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")
    expected_signature = hmac.new(
        settings.razorpay_webhook_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not signature or not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

    event = payload.get("event", "")
    entity = (payload.get("payload") or {}).get("payment", {}).get("entity", {}) or {}
    if not entity and event == "order.paid":
        entity = (payload.get("payload") or {}).get("order", {}).get("entity", {}) or {}

    order_id = entity.get("order_id") or entity.get("id")
    payment_id = entity.get("id") if event != "order.paid" else entity.get("payment_id", "")

    if event not in ("payment.captured", "order.paid"):
        return {"success": True, "ignored": True, "event": event}
    if not order_id or not payment_id:
        return {"success": True, "ignored": True, "reason": "missing_order_or_payment_id"}

    order = credits.get_order(order_id)
    if not order:
        return {"success": True, "ignored": True, "reason": "order_not_found"}

    credits.grant_subscription_credits(
        actor_id=order["actor_id"],
        razorpay_order_id=order_id,
        razorpay_payment_id=payment_id,
        credits_to_grant=int(order["credits_to_grant"]),
    )
    return {"success": True, "event": event, "processed": True}
