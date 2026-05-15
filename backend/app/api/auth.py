from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Request, Response
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from app.core.config import settings
from app.core.auth import set_auth_cookie, clear_auth_cookie, get_current_user, require_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class GoogleLoginRequest(BaseModel):
    credential: str


@router.post("/google")
async def google_login(payload: GoogleLoginRequest, response: Response):
    if not settings.google_client_id:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID is not configured")
    try:
        claims = id_token.verify_oauth2_token(
            payload.credential,
            google_requests.Request(),
            settings.google_client_id,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    user = {
        "sub": claims.get("sub"),
        "email": claims.get("email", ""),
        "name": claims.get("name", ""),
        "picture": claims.get("picture", ""),
    }
    if not user["sub"]:
        raise HTTPException(status_code=401, detail="Invalid Google credential")
    set_auth_cookie(response, user)
    return {"user": user}


@router.get("/me")
async def me(request: Request):
    user = get_current_user(request)
    return {"user": user}


@router.post("/logout")
async def logout(response: Response, request: Request):
    require_user(request)
    clear_auth_cookie(response)
    return {"success": True}
