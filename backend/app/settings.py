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
    # Fictional demo accounts are created on first start when no user exists.
    # Empty means a random password is generated and written to demo_credentials_path.
    seed_users: bool = True
    demo_password: str = ""
    demo_credentials_path: str = "data/demo_credentials.txt"
    session_hours: int = 12
    # One-click sign-in buttons for the fictional demo accounts. Only requests from
    # this computer (loopback) are accepted. Turn off for any shared deployment.
    demo_quick_login: bool = True
    # Lets patients create their own portal account from the sign-in page.
    patient_signup: bool = True
    # A patient can have at most this many check-ins waiting for a nurse.
    patient_open_checkins: int = 2
    # "Today" on the station cards uses this offset from UTC. 330 is India Standard Time.
    clinic_utc_offset_minutes: int = 330
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
