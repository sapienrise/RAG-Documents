from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    openai_api_key: str
    openai_embedding_model: str = "text-embedding-3-small"
    openai_chat_model: str = "gpt-4o"
    chroma_persist_dir: str = "/app/chroma_data"
    storage_dir: str = "/app/storage"
    max_file_size_mb: int = 100
    session_secret: str = "change-me-in-production"
    cors_origins: str = "http://localhost:3000"
    semantic_weight: float = 0.75
    lexical_weight: float = 0.25
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8001/api/drive/callback"
    frontend_url: str = "http://localhost:3005"
    database_url: str = ""
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    subscription_amount_inr: int = 499
    subscription_plan_name: str = "DocuChat Monthly"
    subscription_monthly_credits: int = 1000
    chat_query_credit_cost: int = 1
    upload_base_credit_cost: int = 2
    upload_per_mb_credit_cost: int = 1
    upload_image_ocr_surcharge: int = 3
    upload_pdf_surcharge: int = 1

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    class Config:
        env_file = ".env"


settings = Settings()
