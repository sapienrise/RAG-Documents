from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import documents, chat, auth, drive, settings as app_settings_router, billing

app = FastAPI(
    title="Document Intelligence RAG Chat",
    description="Upload documents and chat with them using AI",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(auth.router)
app.include_router(drive.router)
app.include_router(app_settings_router.router)
app.include_router(billing.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "document-intelligence-api"}
