import os
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    ITMATRIX_API_KEY: str = os.getenv("ITMATRIX_API_KEY", "itm_7a90c90c58321417180d5421e9a87c2c")
    ITMATRIX_BASE_URL: str = os.getenv("ITMATRIX_BASE_URL", "https://api.itmatrixhq.com")
    POLL_INTERVAL_SECONDS: int = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))
    
    CASH_FUTURES_BASIS_MODE: Literal["auto", "manual", "none"] = os.getenv("CASH_FUTURES_BASIS_MODE", "manual")  # type: ignore
    MANUAL_ES_BASIS: float = float(os.getenv("MANUAL_ES_BASIS", "15.0"))
    MANUAL_NQ_BASIS: float = float(os.getenv("MANUAL_NQ_BASIS", "45.0"))
    
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8765"))
    
    USE_MOCK_DATA: bool = os.getenv("USE_MOCK_DATA", "false").lower() in ("true", "1", "yes")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
