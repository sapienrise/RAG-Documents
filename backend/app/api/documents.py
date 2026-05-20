"""Document upload, list, delete endpoints."""
import os
from fastapi import APIRouter, UploadFile, File, Form, Request, Response, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from typing import Literal
from app.core.config import settings
from app.core.session import get_session_id, set_session_cookie, get_actor_id
from app.models.document import Document, DocumentResponse, DocumentVisibilityUpdateRequest
from app.services import storage, parser, vector_store, credits

router = APIRouter(prefix="/api/documents", tags=["documents"])


async def _process_document(doc: Document) -> None:
    """Background task: parse file and index into ChromaDB."""
    try:
        file_type = parser.detect_file_type(doc.name, "")
        pages = parser.extract_text(doc.file_path, file_type)
        vector_store.index_document(
            doc_id=doc.id,
            doc_name=doc.name,
            pages=pages,
            visibility=doc.visibility,
            session_id=doc.session_id,
        )
        doc.status = "ready"
    except Exception as e:
        doc.status = "failed"
        doc.error_message = str(e)
    finally:
        # Keep source files for public documents so they can be downloaded.
        # Private documents follow the existing flow and remove source files.
        if doc.visibility == "private" and doc.file_path and os.path.exists(doc.file_path):
            try:
                os.remove(doc.file_path)
            except Exception:
                pass
            doc.file_path = ""
        storage.upsert_document(doc)


@router.post("", response_model=DocumentResponse)
async def upload_document(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    visibility: Literal["public", "private"] = Form("public"),
):
    session_id = get_session_id(request)
    actor_id = get_actor_id(request)
    set_session_cookie(response, session_id)

    # Validate file type
    ext = os.path.splitext(file.filename or "")[1].lower()
    file_type = parser.SUPPORTED_EXTENSIONS.get(ext)
    if not file_type:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{ext}'. Supported: PDF, DOCX, XLSX, CSV, TXT, PNG, JPG, TIFF, BMP, GIF",
        )

    # Read and validate size
    content = await file.read()
    if len(content) > settings.max_file_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size of {settings.max_file_size_mb} MB",
        )

    upload_cost = credits.calculate_upload_cost(len(content), file_type)
    charged = credits.charge_usage(
        actor_id=actor_id,
        operation="file_upload",
        credits_charged=upload_cost,
        metadata='{"source":"documents.upload"}',
    )
    if not charged:
        balance = credits.get_credit_balance(actor_id)
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits for upload. Balance: {balance}, required: {upload_cost}",
        )

    # Persist file
    os.makedirs(settings.storage_dir, exist_ok=True)
    doc = Document(
        name=file.filename,
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

    # Process in background
    background_tasks.add_task(_process_document, doc)

    return DocumentResponse(**doc.model_dump())


@router.get("", response_model=list[DocumentResponse])
async def list_documents(request: Request, response: Response):
    session_id = get_session_id(request)
    actor_id = get_actor_id(request)
    set_session_cookie(response, session_id)
    docs = storage.list_documents(actor_id)
    return [DocumentResponse(**d.model_dump()) for d in docs]


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, request: Request):
    actor_id = get_actor_id(request)
    doc = storage.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Only uploader can delete private docs; anyone can delete public docs
    if doc.visibility == "private" and doc.session_id != actor_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this document")

    # Remove from vector store
    vector_store.delete_document(doc_id)

    # Remove file
    if doc.file_path and os.path.exists(doc.file_path):
        os.remove(doc.file_path)

    storage.delete_document(doc_id)
    return {"success": True}


@router.patch("/{doc_id}/visibility", response_model=DocumentResponse)
async def update_document_visibility(doc_id: str, payload: DocumentVisibilityUpdateRequest, request: Request):
    actor_id = get_actor_id(request)
    doc = storage.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.visibility == "private" and doc.session_id != actor_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this document")

    if payload.visibility == "private":
        doc.visibility = "private"
        doc.session_id = actor_id
    else:
        doc.visibility = "public"
        doc.session_id = None

    vector_store.update_document_visibility(
        doc_id=doc.id,
        visibility=doc.visibility,
        session_id=doc.session_id,
    )
    storage.upsert_document(doc)
    return DocumentResponse(**doc.model_dump())


@router.get("/{doc_id}/download")
async def download_document(doc_id: str, request: Request):
    actor_id = get_actor_id(request)
    doc = storage.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.visibility == "private" and doc.session_id != actor_id:
        raise HTTPException(status_code=403, detail="Not authorized to download this document")

    if not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Source file is not available for download")

    return FileResponse(path=doc.file_path, filename=doc.name, media_type="application/octet-stream")
