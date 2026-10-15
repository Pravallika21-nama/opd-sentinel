"""HTTP schemas for intake, triage, queue, review, consultation, and prescriptions."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from core.schemas import TriageDecision

ConsultationStatus = Literal[
    "registered",
    "awaiting_doctor",
    "in_consultation",
    "prescription_recorded",
    "referred",
    "completed",
]
ReviewStatus = Literal["pending", "confirmed", "overridden", "escalated"]
Route = Literal[
    "oral",
    "sublingual",
    "topical",
    "inhaled",
    "intravenous",
    "intramuscular",
    "subcutaneous",
    "rectal",
    "ophthalmic",
    "otic",
    "nasal",
    "other",
]


class HealthResponse(BaseModel):
    """Liveness payload for GET /health.

    This reports that the API process is up. It does not report model quality.
    """

    status: Literal["ok"]
    service: str = Field(examples=["OPD Sentinel"])
    version: str


class IntakeRequest(BaseModel):
    """One walk-in. Implausible numbers are accepted and flagged, not rejected.

    `patient_ref`, `patient_name`, `nurse_notes`, and `uncertain_information`
    are stored with the encounter. They are never model inputs.
    """

    age: float | None = None
    sex: str | None = Field(default=None, max_length=40)
    systolic_bp: float | None = None
    diastolic_bp: float | None = None
    pulse: float | None = None
    temperature_c: float | None = None
    spo2: float | None = None
    complaint: str = Field(default="", max_length=2000)
    known_conditions: str = Field(default="", max_length=2000)
    medications: str = Field(default="", max_length=2000)
    arrival_time: datetime | None = None
    illustrative: bool = False
    patient_ref: str = Field(default="", max_length=64)
    patient_name: str = Field(default="", max_length=120)
    nurse_notes: str = Field(default="", max_length=2000)
    uncertain_information: str = Field(default="", max_length=1000)

    @field_validator("patient_ref", "patient_name", "nurse_notes", "uncertain_information")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class BatchIntakeRequest(BaseModel):
    """Several intakes. The handler caps the list length."""

    cases: list[IntakeRequest]


class TriageResponse(TriageDecision):
    """Decision plus the stored id, OPD number, and measured latency."""

    case_id: str
    opd_number: str = ""
    latency_ms: float
    assessed_at: str = ""


class ReviewRequest(BaseModel):
    """Nurse Review. A reason is required for every action."""

    action: Literal["confirm", "override", "escalate", "reassess"]
    reason: str = Field(min_length=3, max_length=1000)
    triage_level: int | None = Field(default=None, ge=1, le=5)
    department: str | None = Field(default=None, max_length=80)


class SendToDoctorRequest(BaseModel):
    """Hand the encounter to the doctor queue."""

    note: str = Field(default="", max_length=1000)


class ConsultationRequest(BaseModel):
    """Doctor-entered findings. Each save is a new version."""

    examination_findings: str = Field(default="", max_length=4000)
    clinical_assessment: str = Field(default="", max_length=4000)
    diagnosis: str = Field(default="", max_length=1000)
    treatment_plan: str = Field(default="", max_length=4000)
    follow_up: str = Field(default="", max_length=1000)
    referral: str = Field(default="", max_length=1000)


class ConsultationStatusRequest(BaseModel):
    """Doctor moves the encounter to a closing status."""

    status: Literal["referred", "completed"]
    note: str = Field(default="", max_length=1000)


class PrescriptionRequest(BaseModel):
    """One prescription line entered by a doctor."""

    medication: str = Field(min_length=2, max_length=200)
    dose: str = Field(min_length=1, max_length=40)
    dose_unit: str = Field(min_length=1, max_length=20)
    route: Route
    frequency: str = Field(min_length=1, max_length=80)
    duration: str = Field(min_length=1, max_length=80)
    instructions: str = Field(default="", max_length=1000)

    @field_validator("medication", "dose", "dose_unit", "frequency", "duration")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Required.")
        return stripped

    @field_validator("dose")
    @classmethod
    def _dose_number(cls, value: str) -> str:
        try:
            amount = float(value)
        except ValueError as exc:
            raise ValueError("Dose must be a number, for example 500 or 2.5.") from exc
        if amount <= 0:
            raise ValueError("Dose must be greater than zero.")
        return value


class PrescriptionStatusRequest(BaseModel):
    """Cancel a prescription line. A reason is required."""

    action: Literal["cancel"]
    reason: str = Field(min_length=3, max_length=1000)


class LoginRequest(BaseModel):
    """Staff sign-in."""

    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=200)


class DemoLoginRequest(BaseModel):
    """One-click sign-in to a fictional demo account."""

    username: str = Field(min_length=1, max_length=64)


class PatientSignupRequest(BaseModel):
    """A patient creates a portal account."""

    username: str = Field(min_length=3, max_length=32)
    display_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=200)

    @field_validator("display_name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if len(stripped) < 2:
            raise ValueError("Enter your name.")
        return stripped


class PatientIntakeRequest(BaseModel):
    """What a patient tells the clinic before a nurse sees them.

    Home readings are optional and stay labelled self-reported. Values outside
    these wide bounds are almost always typing mistakes, so they are refused.
    """

    full_name: str = Field(min_length=2, max_length=120)
    age: float | None = Field(default=None, ge=0, le=120)
    sex: str = Field(default="", max_length=40)
    preferred_language: Literal["en", "hi", "te"] = "en"
    symptoms: str = Field(min_length=3, max_length=2000)
    symptom_duration: str = Field(default="", max_length=80)
    severity: int | None = Field(default=None, ge=0, le=10)
    known_conditions: str = Field(default="", max_length=1000)
    medications: str = Field(default="", max_length=1000)
    allergies: str = Field(default="", max_length=1000)
    self_temperature_c: float | None = Field(default=None, ge=30, le=45)
    self_pulse: float | None = Field(default=None, ge=20, le=250)
    self_systolic_bp: float | None = Field(default=None, ge=50, le=260)
    self_diastolic_bp: float | None = Field(default=None, ge=20, le=160)
    self_spo2: float | None = Field(default=None, ge=50, le=100)
    consent: bool

    @field_validator("sex", "symptom_duration", "known_conditions", "medications", "allergies")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("full_name", "symptoms")
    @classmethod
    def _required_text(cls, value: str) -> str:
        stripped = value.strip()
        if len(stripped) < 2:
            raise ValueError("Required.")
        return stripped

    @field_validator("consent")
    @classmethod
    def _consented(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Consent is needed so the clinic can use these answers.")
        return value


class CheckinRegisterRequest(BaseModel):
    """A nurse registers a check-in with measured vitals after seeing the patient."""

    intake: IntakeRequest
    identity_confirmed: bool

    @field_validator("identity_confirmed")
    @classmethod
    def _confirmed(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Confirm the patient's identity in person before registering.")
        return value


class CheckinReturnRequest(BaseModel):
    """A nurse sends a check-in back to the patient instead of registering it."""

    reason: str = Field(min_length=3, max_length=500)


class QueueItem(BaseModel):
    """One encounter, sorted for the nurse and the doctor."""

    id: str
    opd_number: str = ""
    arrival_time: str
    wait_seconds: float
    triage_level: int | None
    department: str | None
    abstain: bool
    illustrative: bool
    complaint_preview: str
    review_status: ReviewStatus
    consultation_status: ConsultationStatus = "registered"
    source_label: str | None = None
    suggested_level: int | None = None
    data_quality: Literal["ok", "warning"] = "ok"
    red_flag: bool = False
    reassessment: Literal["none", "requested"] = "none"
    position_reason: str = ""
    rank: int = 0
    arrival_position: int = 0
    systolic_bp: float | None = None
    diastolic_bp: float | None = None
    pulse: float | None = None
    temperature_c: float | None = None
    spo2: float | None = None
    nurse_notes: str = ""
    patient_ref: str = ""
    patient_name: str = ""
    prescriptions: int = 0
    via_portal: bool = False
