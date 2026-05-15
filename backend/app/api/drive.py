import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, HTTPException, Request, Response, BackgroundTasks
from pydantic import BaseModel
from app.core.auth import require_user
from app.core.config import settings
from app.core.session import get_actor_id
from app.models.document import Document, DocumentResponse
from app.services import storage, parser
from app.services.drive_tokens import get_tokens, set_tokens
from app.services.pg_settings import get_drive_settings
from app.api.documents import _process_document

router = APIRouter(prefix="/api/drive", tags=["drive"])
STATE_COOKIE = "doc_app_drive_state"
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"


class DriveImportRequest(BaseModel):
    file_id: str
    visibility: str = "private"


def _oauth_config(actor_id: str) -> dict:
    saved = get_drive_settings(actor_id)
    if saved:
        return {
            "client_id": saved.get("google_client_id", ""),
            "client_secret": saved.get("google_client_secret", ""),
            "redirect_uri": saved.get("google_redirect_uri", settings.google_redirect_uri),
        }
    return {
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "redirect_uri": settings.google_redirect_uri,
    }


def _redirect_with_message(status: str) -> str:
    return (
        "<!doctype html><html><body><script>"
        f"window.opener && window.opener.postMessage({{type:'drive_oauth',status:'{status}'}}, '*');"
        "window.close();"
        "</script></body></html>"
    )


async def _refresh_if_needed(actor_id: str) -> dict:
    tokens = get_tokens(actor_id)
    if not tokens:
        raise HTTPException(status_code=401, detail="Google Drive not connected")
    expires_at = tokens.get("expires_at")
    if expires_at:
        expiry = datetime.fromisoformat(expires_at)
        if expiry > datetime.now(timezone.utc) + timedelta(minutes=1):
            return tokens
    oauth_cfg = _oauth_config(actor_id)
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        return tokens
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": oauth_cfg["client_id"],
                "client_secret": oauth_cfg["client_secret"],
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=401, detail="Failed to refresh Google token")
    data = resp.json()
    tokens["access_token"] = data["access_token"]
    tokens["expires_at"] = (
        datetime.now(timezone.utc) + timedelta(seconds=int(data.get("expires_in", 3600)))
    ).isoformat()
    set_tokens(actor_id, tokens)
    return tokens


@router.get("/auth-url")
async def drive_auth_url(request: Request, response: Response):
    require_user(request)
    actor_id = get_actor_id(request)
    oauth_cfg = _oauth_config(actor_id)
    if not oauth_cfg["client_id"] or not oauth_cfg["client_secret"]:
        raise HTTPException(status_code=500, detail="Google OAuth is not configured")
    state = secrets.token_urlsafe(24)
    response.set_cookie(STATE_COOKIE, state, httponly=True, samesite="lax", max_age=600)
    query = urlencode(
        {
            "client_id": oauth_cfg["client_id"],
            "redirect_uri": oauth_cfg["redirect_uri"],
            "response_type": "code",
            "scope": DRIVE_SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
    )
    return {"url": f"https://accounts.google.com/o/oauth2/v2/auth?{query}"}


@router.get("/callback")
async def drive_callback(request: Request, response: Response, code: str = "", state: str = ""):
    require_user(request)
    actor_id = get_actor_id(request)
    oauth_cfg = _oauth_config(actor_id)
    cookie_state = request.cookies.get(STATE_COOKIE, "")
    response.delete_cookie(STATE_COOKIE)
    if not code or not state or state != cookie_state:
        return Response(_redirect_with_message("error"), media_type="text/html")

    async with httpx.AsyncClient(timeout=30) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": oauth_cfg["client_id"],
                "client_secret": oauth_cfg["client_secret"],
                "redirect_uri": oauth_cfg["redirect_uri"],
                "grant_type": "authorization_code",
                "code": code,
            },
        )
    if token_resp.status_code >= 400:
        return Response(_redirect_with_message("error"), media_type="text/html")
    payload = token_resp.json()
    set_tokens(
        actor_id,
        {
            "access_token": payload.get("access_token", ""),
            "refresh_token": payload.get("refresh_token", ""),
            "expires_at": (
                datetime.now(timezone.utc) + timedelta(seconds=int(payload.get("expires_in", 3600)))
            ).isoformat(),
        },
    )
    return Response(_redirect_with_message("success"), media_type="text/html")


@router.get("/files")
async def list_drive_files(request: Request):
    require_user(request)
    actor_id = get_actor_id(request)
    tokens = await _refresh_if_needed(actor_id)
    params = {
        "pageSize": 25,
        "fields": "files(id,name,mimeType,size,modifiedTime)",
        "q": "trashed=false",
        "orderBy": "modifiedTime desc",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            "https://www.googleapis.com/drive/v3/files",
            params=params,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
    if resp.status_code >= 400:
        try:
            payload = resp.json()
            detail = payload.get("error", {}).get("message") or "Failed to list Drive files"
        except Exception:
            detail = "Failed to list Drive files"
        raise HTTPException(status_code=resp.status_code, detail=detail)
    return resp.json()


@router.post("/import", response_model=DocumentResponse)
async def import_drive_file(payload: DriveImportRequest, request: Request, background_tasks: BackgroundTasks):
    require_user(request)
    actor_id = get_actor_id(request)
    visibility = payload.visibility if payload.visibility in ("public", "private") else "private"
    tokens = await _refresh_if_needed(actor_id)

    async with httpx.AsyncClient(timeout=60) as client:
        meta_resp = await client.get(
            f"https://www.googleapis.com/drive/v3/files/{payload.file_id}",
            params={"fields": "id,name,mimeType,size"},
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
    if meta_resp.status_code >= 400:
        raise HTTPException(status_code=meta_resp.status_code, detail="Cannot read Drive file metadata")
    meta = meta_resp.json()
    name = meta.get("name", f"{payload.file_id}.pdf")
    mime_type = meta.get("mimeType", "")

    # Export Google Docs/Sheets to supported file types.
    if mime_type == "application/vnd.google-apps.document":
        download_url = f"https://www.googleapis.com/drive/v3/files/{payload.file_id}/export?mimeType=application/pdf"
        if not name.lower().endswith(".pdf"):
            name += ".pdf"
    elif mime_type == "application/vnd.google-apps.spreadsheet":
        download_url = f"https://www.googleapis.com/drive/v3/files/{payload.file_id}/export?mimeType=text/csv"
        if not name.lower().endswith(".csv"):
            name += ".csv"
    else:
        download_url = f"https://www.googleapis.com/drive/v3/files/{payload.file_id}?alt=media"

    async with httpx.AsyncClient(timeout=180) as client:
        file_resp = await client.get(
            download_url,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
    if file_resp.status_code >= 400:
        raise HTTPException(status_code=file_resp.status_code, detail="Cannot download Drive file")

    ext = os.path.splitext(name)[1].lower()
    file_type = parser.SUPPORTED_EXTENSIONS.get(ext)
    if not file_type:
        raise HTTPException(status_code=415, detail="Unsupported Drive file type for RAG import")

    content = file_resp.content
    if len(content) > settings.max_file_size_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds maximum size of {settings.max_file_size_mb} MB")

    os.makedirs(settings.storage_dir, exist_ok=True)
    doc = Document(
        name=name,
        file_type=file_type,
        size_bytes=len(content),
        visibility=visibility,
        session_id=actor_id if visibility == "private" else None,
        status="processing",
    )
    file_path = os.path.join(settings.storage_dir, f"{doc.id}{ext}")
    doc.file_path = file_path
    with open(file_path, "wb") as f:
        f.write(content)
    storage.upsert_document(doc)
    background_tasks.add_task(_process_document, doc)
    return DocumentResponse(**doc.model_dump())
