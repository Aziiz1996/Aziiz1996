from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    openai_api_key: str
    openai_model: str = "gpt-4.1-mini"
    firebase_project_id: str
    firebase_storage_bucket: str
    admin_api_key: str
    allowed_origins: str = "https://aziiz1996.onrender.com"
    openalex_email: str = ""
    serper_api_key: str = ""
    max_file_mb: int = 25
    min_academic_score: int = 75

    @property
    def origins(self) -> list[str]:
        return [item.strip() for item in self.allowed_origins.split(",") if item.strip()]

@lru_cache
def settings() -> Settings:
    return Settings()
