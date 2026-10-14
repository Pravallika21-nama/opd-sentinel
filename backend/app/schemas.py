"""HTTP schemas for intake, triage, queue, and review."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from core.schemas import TriageDecision


class HealthResponse(BaseModel):
    """Liveness payload for GET /health.

    This reports that the API process is up. It does not report model quality.
    """

    status: Literal["ok"]
    service: str = Field(examples=["OPD Sentinel"])
    version: str


class IntakeRequest(BaseModel):
    """One walk-in. Implausible numbers are accepted and flagged, not rejected."""

    age: float | None = None
    sex: str | None = None
    systolic_bp: float | None = None
    diastolic_bp: float | None = None
    pulse: float | None = None
    temperature_c: float | None = None
    spo2: float | None = None
    complaint: str = ""
    known_conditions: str = ""
    medications: str = ""
    arrival_time: datetime | None = None
    illustrative: bool = False


class BatchIntakeRequest(BaseModel):
    """Several intakes. The handler caps the list length."""

    cases: list[IntakeRequest]


class TriageResponse(TriageDecision):
    """Phase 6 decision plus the stored id and measured latency."""

    case_id: str
    latency_ms: float


class ReviewRequest(BaseModel):
    """Nurse Review. A reason is required for confirm and for override."""

    action: Literal["confirm", "override"]
    reason: str = Field(min_length=3)
    triage_level: int | None = Field(default=None, ge=1, le=5)
    department: str | None = None


class QueueItem(BaseModel):
    """One waiting case, sorted for the nurse."""

    id: str
    arrival_time: str
    wait_seconds: float
    triage_level: int | None
    department: str | None
    abstain: bool
    illustrative: bool
    complaint_preview: str
    review_status: Literal["pending", "confirmed", "overridden"]
    source_label: str | None = None
