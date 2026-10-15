"""Runtime settings.

Clinical thresholds do not live here. They belong in config YAML and stay
marked as clinician-unreviewed until someone qualified signs off.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Process settings loaded from the environment and an optional .env file."""

    model_config = SettingsConfigDict(
        env_prefix="OPD_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_host: str = "127.0.0.1"
    api_port: int = 8000
    database_path: str = "data/sentinel.db"
    seed_demo: bool = False
    mimic_ed_dir: str = ""
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings for this process."""
    return Settings()
