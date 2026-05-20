from typing import Optional
import math
import threading
import psycopg
from psycopg.rows import dict_row
from app.core.config import settings

PLANS_TABLE = "RAG_billing_plans"
SUBSCRIPTIONS_TABLE = "RAG_user_subscriptions"
LEDGER_TABLE = "RAG_credit_ledger"
USAGE_TABLE = "RAG_usage_events"
ORDERS_TABLE = "RAG_billing_orders"
_SCHEMA_READY = False
_SCHEMA_LOCK = threading.Lock()


def _connect():
    if not settings.database_url:
        raise ValueError("DATABASE_URL is not configured")
    return psycopg.connect(settings.database_url, row_factory=dict_row, connect_timeout=3)


def ensure_tables() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return
        _ensure_tables_once()
        _SCHEMA_READY = True


def _ensure_tables_once() -> None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {PLANS_TABLE} (
                    plan_id TEXT PRIMARY KEY,
                    plan_name TEXT NOT NULL,
                    monthly_credits INTEGER NOT NULL,
                    amount_inr INTEGER NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {SUBSCRIPTIONS_TABLE} (
                    actor_id TEXT PRIMARY KEY,
                    plan_id TEXT NOT NULL REFERENCES {PLANS_TABLE}(plan_id),
                    status TEXT NOT NULL,
                    razorpay_order_id TEXT,
                    razorpay_payment_id TEXT,
                    current_period_start TIMESTAMPTZ,
                    current_period_end TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {LEDGER_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    actor_id TEXT NOT NULL,
                    entry_type TEXT NOT NULL,
                    credits_delta INTEGER NOT NULL,
                    reference_type TEXT NOT NULL,
                    reference_id TEXT,
                    metadata JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {USAGE_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    actor_id TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    credits_charged INTEGER NOT NULL,
                    metadata JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {ORDERS_TABLE} (
                    razorpay_order_id TEXT PRIMARY KEY,
                    actor_id TEXT NOT NULL,
                    credits_to_grant INTEGER NOT NULL,
                    amount_inr INTEGER NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                f"""
                INSERT INTO {PLANS_TABLE} (plan_id, plan_name, monthly_credits, amount_inr, is_active, updated_at)
                VALUES ('default_monthly', %s, %s, %s, TRUE, NOW())
                ON CONFLICT (plan_id) DO UPDATE SET
                    plan_name = EXCLUDED.plan_name,
                    monthly_credits = EXCLUDED.monthly_credits,
                    amount_inr = EXCLUDED.amount_inr,
                    is_active = TRUE,
                    updated_at = NOW()
                """,
                (
                    settings.subscription_plan_name,
                    settings.subscription_monthly_credits,
                    settings.subscription_amount_inr,
                ),
            )
        conn.commit()


def record_order(
    razorpay_order_id: str,
    actor_id: str,
    credits_to_grant: int,
    amount_inr: int,
) -> None:
    ensure_tables()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {ORDERS_TABLE}
                (razorpay_order_id, actor_id, credits_to_grant, amount_inr)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (razorpay_order_id) DO NOTHING
                """,
                (razorpay_order_id, actor_id, credits_to_grant, amount_inr),
            )
        conn.commit()


def get_order(razorpay_order_id: str) -> Optional[dict]:
    ensure_tables()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT razorpay_order_id, actor_id, credits_to_grant, amount_inr
                FROM {ORDERS_TABLE}
                WHERE razorpay_order_id = %s
                """,
                (razorpay_order_id,),
            )
            return cur.fetchone()


def get_credit_balance(actor_id: str) -> int:
    ensure_tables()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COALESCE(SUM(credits_delta), 0) AS balance FROM {LEDGER_TABLE} WHERE actor_id = %s",
                (actor_id,),
            )
            row = cur.fetchone()
            return int((row or {}).get("balance", 0))


def grant_subscription_credits(
    actor_id: str,
    razorpay_order_id: str,
    razorpay_payment_id: str,
    credits_to_grant: int,
) -> None:
    ensure_tables()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT 1 FROM {LEDGER_TABLE}
                WHERE actor_id = %s
                  AND entry_type = 'grant'
                  AND reference_type = 'razorpay_payment'
                  AND reference_id = %s
                LIMIT 1
                """,
                (actor_id, razorpay_payment_id),
            )
            if cur.fetchone():
                return

            cur.execute(
                f"""
                INSERT INTO {LEDGER_TABLE}
                (actor_id, entry_type, credits_delta, reference_type, reference_id, metadata)
                VALUES (%s, 'grant', %s, 'razorpay_payment', %s, %s::jsonb)
                """,
                (
                    actor_id,
                    credits_to_grant,
                    razorpay_payment_id,
                    (
                        '{"plan_id":"wallet_topup","razorpay_order_id":"'
                        + razorpay_order_id
                        + '","razorpay_payment_id":"'
                        + razorpay_payment_id
                        + '","credits_to_grant":'
                        + str(credits_to_grant)
                        + "}"
                    ),
                ),
            )

            cur.execute(
                f"""
                INSERT INTO {SUBSCRIPTIONS_TABLE}
                (actor_id, plan_id, status, razorpay_order_id, razorpay_payment_id, current_period_start, current_period_end, updated_at)
                VALUES (%s, 'default_monthly', 'active', %s, %s, NOW(), NOW() + INTERVAL '30 days', NOW())
                ON CONFLICT (actor_id) DO UPDATE SET
                    plan_id = EXCLUDED.plan_id,
                    status = EXCLUDED.status,
                    razorpay_order_id = EXCLUDED.razorpay_order_id,
                    razorpay_payment_id = EXCLUDED.razorpay_payment_id,
                    current_period_start = EXCLUDED.current_period_start,
                    current_period_end = EXCLUDED.current_period_end,
                    updated_at = NOW()
                """,
                (actor_id, razorpay_order_id, razorpay_payment_id),
            )
        conn.commit()


def charge_usage(
    actor_id: str,
    operation: str,
    credits_charged: int,
    metadata: Optional[str] = None,
) -> bool:
    ensure_tables()
    if credits_charged <= 0:
        return True
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COALESCE(SUM(credits_delta), 0) AS balance FROM {LEDGER_TABLE} WHERE actor_id = %s",
                (actor_id,),
            )
            balance = int((cur.fetchone() or {}).get("balance", 0))
            if balance < credits_charged:
                return False

            meta_json = metadata or "{}"
            cur.execute(
                f"""
                INSERT INTO {LEDGER_TABLE}
                (actor_id, entry_type, credits_delta, reference_type, reference_id, metadata)
                VALUES (%s, 'usage', %s, 'operation', %s, %s::jsonb)
                """,
                (actor_id, -credits_charged, operation, meta_json),
            )
            cur.execute(
                f"""
                INSERT INTO {USAGE_TABLE}
                (actor_id, operation, credits_charged, metadata)
                VALUES (%s, %s, %s, %s::jsonb)
                """,
                (actor_id, operation, credits_charged, meta_json),
            )
        conn.commit()
        return True


def calculate_upload_cost(size_bytes: int, file_type: str, mime_type: str = "") -> int:
    mb = max(1, math.ceil(size_bytes / (1024 * 1024)))
    cost = settings.upload_base_credit_cost + (mb * settings.upload_per_mb_credit_cost)
    ft = (file_type or "").lower()
    mt = (mime_type or "").lower()
    if ft == "image":
        cost += settings.upload_image_ocr_surcharge
    if ft == "pdf" or "pdf" in mt:
        cost += settings.upload_pdf_surcharge
    return max(1, int(cost))
