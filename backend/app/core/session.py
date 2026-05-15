import uuid
from fastapi import Request, Response
from itsdangerous import URLSafeSerializer
from app.core.config import settings
from app.core.auth import get_current_user

_serializer = URLSafeSerializer(settings.session_secret, salt="session")
SESSION_COOKIE = "doc_app_session"


def get_session_id(request: Request) -> str:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        try:
            return _serializer.loads(token)
        except Exception:
            pass
    return str(uuid.uuid4())


def set_session_cookie(response: Response, session_id: str) -> None:
    token = _serializer.dumps(session_id)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=86400 * 7,  # 7 days
    )


def get_actor_id(request: Request) -> str:
    user = get_current_user(request)
    if user and user.get("sub"):
        return f"google:{user['sub']}"
    return get_session_id(request)
