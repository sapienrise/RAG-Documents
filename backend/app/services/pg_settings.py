from typing import Optional
import psycopg
from psycopg.rows import dict_row
from app.core.config import settings

COMMON_TABLE = "RAG_google_drive_common_settings"
USER_TABLE = "RAG_google_drive_user_keys"


def _connect():
    if not settings.database_url:
        raise ValueError("DATABASE_URL is not configured")
    return psycopg.connect(settings.database_url, row_factory=dict_row)


def ensure_table() -> None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {COMMON_TABLE} (
                    id SMALLINT PRIMARY KEY DEFAULT 1,
                    google_client_id TEXT NOT NULL,
                    google_client_secret TEXT NOT NULL,
                    google_redirect_uri TEXT NOT NULL,
                    frontend_url TEXT NOT NULL,
                    other_data TEXT DEFAULT '',
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
                """
            )
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {USER_TABLE} (
                    actor_id TEXT PRIMARY KEY,
                    google_drive_api_key TEXT DEFAULT '',
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
                """
            )
        conn.commit()


def get_drive_settings(actor_id: str) -> Optional[dict]:
    ensure_table()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT google_client_id, google_client_secret, google_redirect_uri, frontend_url, other_data
                FROM {COMMON_TABLE}
                WHERE id = 1
                """,
            )
            common_row = cur.fetchone()
            cur.execute(
                f"""
                SELECT google_drive_api_key
                FROM {USER_TABLE}
                WHERE actor_id = %s
                """,
                (actor_id,),
            )
            user_row = cur.fetchone()
            if not common_row:
                return None
            data = dict(common_row)
            data["google_drive_api_key"] = (user_row or {}).get("google_drive_api_key", "")
            return data


def upsert_drive_settings(
    actor_id: str,
    google_client_id: str,
    google_client_secret: str,
    google_drive_api_key: str,
    google_redirect_uri: str,
    frontend_url: str,
    other_data: str = "",
) -> None:
    ensure_table()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {COMMON_TABLE}
                (id, google_client_id, google_client_secret, google_redirect_uri, frontend_url, other_data, updated_at)
                VALUES (1, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    google_client_id = EXCLUDED.google_client_id,
                    google_client_secret = EXCLUDED.google_client_secret,
                    google_redirect_uri = EXCLUDED.google_redirect_uri,
                    frontend_url = EXCLUDED.frontend_url,
                    other_data = EXCLUDED.other_data,
                    updated_at = NOW()
                """,
                (
                    google_client_id,
                    google_client_secret,
                    google_redirect_uri,
                    frontend_url,
                    other_data,
                ),
            )
            cur.execute(
                f"""
                INSERT INTO {USER_TABLE}
                (actor_id, google_drive_api_key, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (actor_id) DO UPDATE SET
                    google_drive_api_key = EXCLUDED.google_drive_api_key,
                    updated_at = NOW()
                """,
                (actor_id, google_drive_api_key),
            )
        conn.commit()
