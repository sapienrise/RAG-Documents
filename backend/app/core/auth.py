from typing import Optional
from fastapi import Request, Response, HTTPException
from itsdangerous import URLSafeSerializer
from app.core.config import settings

_serializer = URLSafeSerializer(settings.session_secret, salt="google-auth")
AUTH_COOKIE = "doc_app_auth"


def set_auth_cookie(response: Response, user: dict) -> None:
    token = _serializer.dumps(user)
    response.set_cookie(
        AUTH_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=86400 * 7,
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(AUTH_COOKIE)


def get_current_user(request: Request) -> Optional[dict]:
    token = request.cookies.get(AUTH_COOKIE)
    if not token:
        return None
    try:
        data = _serializer.loads(token)
        if not isinstance(data, dict) or not data.get("sub"):
            return None
        return data
    except Exception:
        return None


def require_user(request: Request) -> dict:
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user
