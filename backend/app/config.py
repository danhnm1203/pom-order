from functools import lru_cache
from uuid import UUID

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Try .env in cwd first, then backend/.env so it works whether you run
        # `uvicorn` from `backend/` (via `make dev`) or from project root.
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    api_title: str = "Pom Order API"
    api_version: str = "0.1.0"

    supabase_url: str
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str

    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@127.0.0.1:54322/postgres"
    )

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    default_shop_id: UUID = UUID("00000000-0000-0000-0000-000000000001")

    log_level: str = "INFO"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
