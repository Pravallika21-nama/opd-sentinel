"""SQLite audit log and queue.

The audit log is append-only. Predictions and nurse reviews are new rows.
Nothing in this module updates or deletes a stored decision.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import Engine, Integer, String, Text, create_engine, text
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
    opd_number: Mapped[str | None] = mapped_column(String(32), nullable=True)


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
        _ensure_opd_storage(engine)
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
    """Create tables if they do not exist, then fill any missing OPD numbers."""
    get_engine()
    backfill_opd_numbers()


def _ensure_opd_storage(engine: Engine) -> None:
    """Add the OPD number column on databases created before it existed."""
    with engine.begin() as conn:
        tables = {
            row[0]
            for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        }
        if "cases" in tables:
            columns = {row[1] for row in conn.execute(text("PRAGMA table_info(cases)"))}
            if "opd_number" not in columns:
                conn.execute(text("ALTER TABLE cases ADD COLUMN opd_number VARCHAR(32)"))
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS opd_counters "
                "(year INTEGER PRIMARY KEY, last_value INTEGER NOT NULL)"
            )
        )


def _year_of(created_at: str) -> int:
    try:
        return int(created_at[:4])
    except ValueError:
        return datetime_year_fallback()


def datetime_year_fallback() -> int:
    from datetime import UTC, datetime

    return datetime.now(UTC).year


def _parse_opd(value: str | None) -> tuple[int, int] | None:
    if not value or not value.startswith("OPD-"):
        return None
    parts = value.split("-")
    if len(parts) != 3 or not parts[1].isdigit() or not parts[2].isdigit():
        return None
    return int(parts[1]), int(parts[2])


def allocate_opd_number(session: Session, created_at: str) -> str:
    """Reserve the next OPD number for a year. The same row is never issued twice."""
    year = _year_of(created_at)
    session.execute(
        text(
            "INSERT INTO opd_counters (year, last_value) VALUES (:year, 0) "
            "ON CONFLICT(year) DO NOTHING"
        ),
        {"year": year},
    )
    value = session.execute(
        text(
            "UPDATE opd_counters SET last_value = last_value + 1 "
            "WHERE year = :year RETURNING last_value"
        ),
        {"year": year},
    ).scalar_one()
    return f"OPD-{year}-{int(value):04d}"


def backfill_opd_numbers() -> None:
    """Assign a stable OPD number to stored cases that do not have one."""
    session = get_engine()()
    try:
        rows = session.execute(
            text("SELECT id, created_at, opd_number FROM cases ORDER BY created_at ASC, id ASC")
        ).all()
        highest: dict[int, int] = {}
        for _case_id, _created_at, number in rows:
            parsed = _parse_opd(number)
            if parsed is not None:
                year, sequence = parsed
                highest[year] = max(highest.get(year, 0), sequence)
        for year, sequence in highest.items():
            session.execute(
                text(
                    "INSERT INTO opd_counters (year, last_value) VALUES (:year, :sequence) "
                    "ON CONFLICT(year) DO UPDATE SET last_value = "
                    "MAX(opd_counters.last_value, excluded.last_value)"
                ),
                {"year": year, "sequence": sequence},
            )
        for case_id, created_at, number in rows:
            if number:
                continue
            assigned = allocate_opd_number(session, created_at)
            session.execute(
                text(
                    "UPDATE cases SET opd_number = :number "
                    "WHERE id = :case_id AND opd_number IS NULL"
                ),
                {"number": assigned, "case_id": case_id},
            )
        session.commit()
        session.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_cases_opd_number ON cases (opd_number)")
        )
        session.commit()
    finally:
        session.close()
