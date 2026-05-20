from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Literal
from app.core.auth import require_user
from app.core.session import get_actor_id
from app.core.config import settings as app_settings
from app.services.pg_settings import (
    get_drive_settings,
    upsert_drive_settings,
    get_user_visibility_mode,
    upsert_user_visibility_mode,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


class DriveSettingsPayload(BaseModel):
    google_client_id: str
    google_client_secret: str
    google_drive_api_key: str = ""
    google_redirect_uri: str
    frontend_url: str
    other_data: str = ""
    default_visibility: Literal["public", "private"] = "public"


class VisibilityModePayload(BaseModel):
    visibility_mode: Literal["public", "private"]


@router.get("/drive")
async def get_settings(request: Request):
    require_user(request)
    actor_id = get_actor_id(request)
    try:
        saved = get_drive_settings(actor_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    if saved:
        saved["google_client_secret"] = "********"
        return saved
    return {
        "actor_id": actor_id,
        "google_client_id": app_settings.google_client_id,
        "google_client_secret": "",
        "google_drive_api_key": "",
        "google_redirect_uri": app_settings.google_redirect_uri,
        "frontend_url": app_settings.frontend_url,
        "other_data": "",
        "default_visibility": "public",
    }


@router.post("/drive")
async def save_settings(payload: DriveSettingsPayload, request: Request):
    require_user(request)
    actor_id = get_actor_id(request)
    if not payload.google_client_id.strip() or not payload.google_client_secret.strip():
        raise HTTPException(status_code=400, detail="Client ID and Client Secret are required")
    try:
        upsert_drive_settings(
            actor_id=actor_id,
            google_client_id=payload.google_client_id.strip(),
            google_client_secret=payload.google_client_secret.strip(),
            google_drive_api_key=payload.google_drive_api_key.strip(),
            google_redirect_uri=payload.google_redirect_uri.strip(),
            frontend_url=payload.frontend_url.strip(),
            other_data=payload.other_data.strip(),
            default_visibility=payload.default_visibility,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {"success": True}


@router.get("/visibility")
async def get_visibility_mode(request: Request):
    require_user(request)
    actor_id = get_actor_id(request)
    try:
        mode = get_user_visibility_mode(actor_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {"visibility_mode": mode}


@router.put("/visibility")
async def save_visibility_mode(payload: VisibilityModePayload, request: Request):
    require_user(request)
    actor_id = get_actor_id(request)
    try:
        upsert_user_visibility_mode(actor_id, payload.visibility_mode)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {"success": True, "visibility_mode": payload.visibility_mode}
