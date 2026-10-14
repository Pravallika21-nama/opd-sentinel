"""SQLite audit log and queue.

The audit log is append-only. Predictions and nurse reviews are new rows.
Nothing in this module updates or deletes a stored decision.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.settings import get_settings
from core.paths import repo_root

_ENGINES: dict[str, sessionmaker[Session]] = {}


class Base(DeclarativeBase):
    """Declarative base for the audit database."""


class CaseRecord(Base):
    """One intake. The raw JSON is the nurse's entry, unmodified."""

    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[str] = mapped_column(String(40))
    arrival_time: Mapped[str] = mapped_column(String(40))
    raw_json: Mapped[str] = mapped_column(Text)
    illustrative: Mapped[int] = mapped_column(Integer, default=0)
    complaint_preview: Mapped[str] = mapped_column(String(240), default="")


class PredictionRecord(Base):
    """Model and rule output for a case. Later reviews do not overwrite this row."""

    __tablename__ = "predictions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    case_id: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[str] = mapped_column(String(40))
    output_json: Mapped[str] = mapped_column(Text)


class NurseReviewRecord(Base):
    """A confirm or override. The reason is required by the API."""

    __tablename__ = "nurse_reviews"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    case_id: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[str] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(16))
    triage_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    department: Mapped[str | None] = mapped_column(String(80), nullable=True)
    reason: Mapped[str] = mapped_column(Text)


class AuditRecord(Base):
    """Append-only event. Rows are inserted and never updated."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[str] = mapped_column(String(40))
    event: Mapped[str] = mapped_column(String(40))
    payload_json: Mapped[str] = mapped_column(Text)


def database_file() -> Path:
    """Resolve the SQLite file from settings, relative to the repository root."""
    configured = Path(get_settings().database_path)
    if not configured.is_absolute():
        configured = repo_root() / configured
    configured.parent.mkdir(parents=True, exist_ok=True)
    return configured


def get_engine() -> sessionmaker[Session]:
    """Return a session factory for the current database path."""
    path = database_file()
    key = str(path)
    factory = _ENGINES.get(key)
    if factory is None:
        engine = create_engine(
            "sqlite:///" + path.resolve().as_posix(),
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(engine)
        factory = sessionmaker(bind=engine)
        _ENGINES[key] = factory
    return factory


def reset_engines() -> None:
    """Drop cached engines. Tests use this after pointing settings at a new file."""
    _ENGINES.clear()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Yield a session and close it. Callers commit explicitly."""
    session = get_engine()()
    try:
        yield session
    finally:
        session.close()


def init_db() -> None:
    """Create tables if they do not exist."""
    get_engine()
