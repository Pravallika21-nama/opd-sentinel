"""Triage, queue, consultation, prescription, portal, operations, rules, and metrics routes.

Every route except /health, /auth/login, /auth/options, /auth/demo-login
(loopback only, demo accounts only), and /auth/register-patient needs a
signed-in user. Routes name the roles they allow; the check runs on the server.
Patients reach only /patient/* and /auth/*.
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from app.auth import (
    StaffUser,
    bearer_token,
    current_user,
    demo_accounts,
    demo_login,
    is_loopback,
    login,
    logout,
    require_roles,
)
from app.schemas import (
    BatchIntakeRequest,
    CheckinRegisterRequest,
    CheckinReturnRequest,
    ConsultationRequest,
    ConsultationStatusRequest,
    DemoLoginRequest,
    IntakeRequest,
    LoginRequest,
    PatientIntakeRequest,
    PatientSignupRequest,
    PrescriptionRequest,
    PrescriptionStatusRequest,
    QueueItem,
    ReviewRequest,
    SendToDoctorRequest,
    TriageResponse,
)
from app.services.insights import dataset_insights
from app.services.operations import operations_summary
from app.services.portal import (
    create_checkin,
    get_checkin,
    get_own_checkin,
    list_checkins,
    list_own_checkins,
    register_checkin,
    register_patient,
    return_checkin,
    withdraw_checkin,
)
from app.services.store import (
    add_prescription,
    change_prescription,
    doctor_queue,
    get_case,
    list_audit,
    list_encounters,
    list_queue,
    review_case,
    save_consultation,
    send_to_doctor,
    set_consultation_status,
    start_consultation,
    triage_and_store,
)
from app.services.summary import clinic_timezone, station_summary
from app.settings import get_settings
from core.config_loader import (
    load_demo_config,
    load_red_flag_config,
    load_safety_config,
    load_settings,
    load_validation_config,
)
from core.paths import repo_root
from core.red_flags import find_red_flags
from core.safety_rules import apply_safety_rules, rule_floor
from core.validation import validate_intake
from ml.predict import classical_available, classical_metadata

router = APIRouter()
_BATCH_LIMIT = 30

Nurse = Annotated[StaffUser, Depends(require_roles("nurse"))]
Doctor = Annotated[StaffUser, Depends(require_roles("doctor"))]
Admin = Annotated[StaffUser, Depends(require_roles("admin"))]
ClinicalStaff = Annotated[StaffUser, Depends(require_roles("nurse", "doctor"))]
AnyStaff = Annotated[StaffUser, Depends(require_roles("nurse", "doctor", "admin"))]
Patient = Annotated[StaffUser, Depends(require_roles("patient"))]
SignedIn = Annotated[StaffUser, Depends(current_user)]


def _clinic_today() -> tuple[Any, Any]:
    tz = clinic_timezone(get_settings().clinic_utc_offset_minutes)
    return datetime.now(UTC).astimezone(tz).date(), tz


# ---------------------------------------------------------------- auth


@router.post("/auth/login")
def auth_login(body: LoginRequest) -> dict[str, Any]:
    """Exchange a username and password for a bearer token."""
    token, user, expires_at = login(body.username.strip(), body.password)
    return {
        "token": token,
        "expires_at": expires_at,
        "user": {
            "username": user.username,
            "display_name": user.display_name,
            "role": user.role,
        },
    }


@router.post("/auth/logout")
def auth_logout(token: Annotated[str, Depends(bearer_token)]) -> dict[str, str]:
    """Revoke the current token."""
    logout(token)
    return {"status": "signed out"}


@router.get("/auth/me")
def auth_me(user: SignedIn) -> dict[str, str]:
    """The signed-in user."""
    return {"username": user.username, "display_name": user.display_name, "role": user.role}


@router.get("/auth/options")
def auth_options(request: Request) -> dict[str, Any]:
    """Public sign-in options: patient sign-up, and demo buttons for local requests only."""
    local = is_loopback(request.client.host if request.client else None)
    return {
        "patient_signup": get_settings().patient_signup,
        "demo_accounts": demo_accounts() if local else [],
    }


@router.post("/auth/demo-login")
def auth_demo_login(body: DemoLoginRequest, request: Request) -> dict[str, Any]:
    """One-click sign-in to a fictional demo account, from this computer only."""
    token, user, expires_at = demo_login(
        body.username.strip(), request.client.host if request.client else None
    )
    return {
        "token": token,
        "expires_at": expires_at,
        "user": {
            "username": user.username,
            "display_name": user.display_name,
            "role": user.role,
        },
    }


@router.post("/auth/register-patient", status_code=201)
def auth_register_patient(body: PatientSignupRequest) -> dict[str, Any]:
    """Create a patient portal account and sign it in."""
    token, user, expires_at = register_patient(body)
    return {
        "token": token,
        "expires_at": expires_at,
        "user": {
            "username": user.username,
            "display_name": user.display_name,
            "role": user.role,
        },
    }


# ---------------------------------------------------------------- patient portal


@router.get("/patient/checkins")
def patient_checkins(user: Patient) -> list[dict[str, Any]]:
    """The signed-in patient's own check-ins, newest first."""
    return list_own_checkins(user)


@router.post("/patient/checkins", status_code=201)
def patient_checkin_create(body: PatientIntakeRequest, user: Patient) -> dict[str, Any]:
    """Send symptoms and history to the clinic. A nurse verifies them in person."""
    return create_checkin(user, body)


@router.get("/patient/checkins/{checkin_id}")
def patient_checkin(checkin_id: str, user: Patient) -> dict[str, Any]:
    """One of the patient's own check-ins. Other patients' records return 404."""
    return get_own_checkin(user, checkin_id)


@router.post("/patient/checkins/{checkin_id}/withdraw")
def patient_checkin_withdraw(checkin_id: str, user: Patient) -> dict[str, Any]:
    """Withdraw a check-in that no nurse has handled yet."""
    return withdraw_checkin(user, checkin_id)


# ---------------------------------------------------------------- check-in desk


@router.get("/checkins")
def checkins(
    _user: AnyStaff,
    status: Literal["submitted", "registered", "returned", "withdrawn"] | None = Query(
        default=None
    ),
) -> list[dict[str, Any]]:
    """Patient check-ins for the nurse desk. Waiting ones with red-flag words first."""
    return list_checkins(status)


@router.get("/checkins/{checkin_id}")
def checkin(checkin_id: str, _user: AnyStaff) -> dict[str, Any]:
    """One patient check-in with its linked encounter, if registered."""
    return get_checkin(checkin_id)


@router.post("/checkins/{checkin_id}/register")
def checkin_register(checkin_id: str, body: CheckinRegisterRequest, user: Nurse) -> dict[str, Any]:
    """Register the patient with measured vitals. Runs the normal triage pipeline."""
    return register_checkin(checkin_id, body, user)


@router.post("/checkins/{checkin_id}/return")
def checkin_return(checkin_id: str, body: CheckinReturnRequest, user: Nurse) -> dict[str, Any]:
    """Send the check-in back to the patient with a reason."""
    return return_checkin(checkin_id, body, user)


# ---------------------------------------------------------------- nurse station


@router.post("/triage", response_model=TriageResponse)
def triage(intake: IntakeRequest, user: Nurse) -> TriageResponse:
    """Register and score one encounter. Implausible vitals are flagged, not rejected."""
    return triage_and_store(intake, actor=user)


@router.post("/triage/batch", response_model=list[TriageResponse])
def triage_batch(body: BatchIntakeRequest, user: Nurse) -> list[TriageResponse] | JSONResponse:
    """Register a short list of encounters."""
    if len(body.cases) > _BATCH_LIMIT:
        return JSONResponse(
            status_code=422,
            content={
                "message": f"Batch limit is {_BATCH_LIMIT} cases.",
                "errors": [{"field": "cases", "message": f"Send at most {_BATCH_LIMIT} cases."}],
            },
        )
    return [triage_and_store(case, actor=user) for case in body.cases]


@router.get("/queue", response_model=list[QueueItem])
def queue(
    _user: AnyStaff,
    include_closed: bool = Query(default=False),
) -> list[QueueItem]:
    """Open encounters, emergencies and abstentions first."""
    return list_queue(include_closed=include_closed)


@router.get("/station/summary")
def station(_user: AnyStaff) -> dict[str, Any]:
    """Six nurse-station counts. Each value includes the rule that produced it."""
    today, tz = _clinic_today()
    return station_summary(list_encounters(), today=today, tz=tz)


@router.get("/queue/{case_id}")
def queue_case(case_id: str, _user: AnyStaff) -> dict[str, Any]:
    """One encounter with its decision, reviews, notes, and prescriptions."""
    return get_case(case_id)


@router.get("/encounters/{case_id}")
def encounter(case_id: str, _user: AnyStaff) -> dict[str, Any]:
    """Same record as /queue/{case_id}. Every dashboard reads this one encounter."""
    return get_case(case_id)


@router.post("/queue/{case_id}/review")
def queue_review(case_id: str, review: ReviewRequest, user: Nurse) -> dict[str, Any]:
    """Append a Nurse Review. The prediction row is not edited."""
    return review_case(case_id, review, user)


@router.post("/encounters/{case_id}/send-to-doctor")
def encounter_send(case_id: str, body: SendToDoctorRequest, user: Nurse) -> dict[str, Any]:
    """Hand a reviewed encounter to the doctor queue."""
    return send_to_doctor(case_id, body, user)


# ---------------------------------------------------------------- doctor review


@router.get("/doctor/queue", response_model=list[QueueItem])
def doctor_work_queue(_user: AnyStaff) -> list[QueueItem]:
    """Encounters sent to the doctor, in safety-adjusted priority order."""
    return doctor_queue()


@router.post("/encounters/{case_id}/consultation/start")
def consultation_start(case_id: str, user: Doctor) -> dict[str, Any]:
    """Doctor opens the consultation."""
    return start_consultation(case_id, user)


@router.put("/encounters/{case_id}/consultation")
def consultation_save(case_id: str, body: ConsultationRequest, user: Doctor) -> dict[str, Any]:
    """Save a new version of the doctor's findings, assessment, and plan."""
    return save_consultation(case_id, body, user)


@router.post("/encounters/{case_id}/status")
def consultation_status(
    case_id: str, body: ConsultationStatusRequest, user: Doctor
) -> dict[str, Any]:
    """Refer or complete the consultation."""
    return set_consultation_status(case_id, body, user)


@router.post("/encounters/{case_id}/prescriptions")
def prescription_create(case_id: str, body: PrescriptionRequest, user: Doctor) -> dict[str, Any]:
    """Record one prescription line. Doctors only."""
    return add_prescription(case_id, body, user)


@router.post("/prescriptions/{prescription_id}/status")
def prescription_status(
    prescription_id: str,
    body: PrescriptionStatusRequest,
    user: Doctor,
) -> dict[str, Any]:
    """Cancel a prescription line with a reason. Doctors only."""
    return change_prescription(prescription_id, body, user)


# ---------------------------------------------------------------- operations and audit


@router.get("/operations/summary")
def operations(_user: Admin) -> dict[str, Any]:
    """Operational KPIs and distributions from stored encounters."""
    today, tz = _clinic_today()
    return operations_summary(list_encounters(), today=today, tz=tz)


@router.get("/audit")
def audit(
    user: AnyStaff,
    case_id: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
) -> list[dict[str, Any]]:
    """Append-only audit log. The full log is for administrators; staff see one encounter."""
    if not case_id and user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail={"message": "The full audit log is for administrators. Open one encounter."},
        )
    return list_audit(case_id, limit=limit)


# ---------------------------------------------------------------- rules and system


@router.get("/rules")
def rules(_user: AnyStaff) -> dict[str, Any]:
    """Safety-Rule Layer and red-flag lexicon, for the rules page."""
    safety = load_safety_config()
    flags = load_red_flag_config()
    visible_rules = []
    for rule in safety["rules"]:
        visible = {key: value for key, value in rule.items() if key != "example"}
        visible_rules.append(visible)
    return {
        "clinically_reviewed": False,
        "note": "Thresholds are placeholders until a clinician reviews them.",
        "rules": visible_rules,
        "red_flags": flags["flags"],
        "languages": (
            "English, Hindi (roman and Devanagari), Telugu (roman and script), "
            "and a small Tamil set."
        ),
    }


@router.get("/validation-ranges")
def validation_ranges(_user: AnyStaff) -> dict[str, Any]:
    """Placeholder plausibility ranges for live form hints."""
    config = load_validation_config()
    return {
        "clinically_reviewed": config.get("clinically_reviewed", False),
        "fields": config["fields"],
        "temperature_unit": config["temperature_unit"],
    }


@router.post("/rules/check")
def rules_check(intake: IntakeRequest, _user: ClinicalStaff) -> dict[str, Any]:
    """Run validation and the Safety-Rule Layer only. Nothing is stored."""
    raw = intake.model_dump(mode="json")
    validation = validate_intake(raw)
    flags = find_red_flags(raw.get("complaint"))
    fired = apply_safety_rules(validation, flags)
    return {
        "clinically_reviewed": False,
        "banner": "PLACEHOLDER — CLINICAL REVIEW REQUIRED",
        "validation_issues": [issue.model_dump() for issue in validation.fields.values()],
        "red_flags": [flag.model_dump() for flag in flags],
        "fired_rules": [rule.model_dump() for rule in fired],
        "rule_level": rule_floor(fired),
        "unassessable": validation.unassessable,
        "note": "Safety-Rule Layer only. Classical ML is not applied.",
    }


def _read_json(path: Any) -> dict[str, Any]:
    if not path.is_file():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


@router.get("/system")
def system_status(_user: AnyStaff) -> dict[str, Any]:
    """Versions and availability. Missing artefacts stay Pending. No scores are invented."""
    settings = load_settings()
    root = repo_root()
    manifest = _read_json(root / settings["data"]["processed_dir"] / "manifest.json")
    report = root / settings["reports"]["json"]
    mimic_manifest = root / "data" / "processed" / "mimic_iv_ed_manifest.json"
    mimic_dir = os.environ.get("OPD_MIMIC_ED_DIR", "").strip()
    if mimic_manifest.is_file():
        mimic_status = "Inspected locally. Held-out evaluation is Pending."
    elif mimic_dir:
        mimic_status = "Path is set. The prepare command has not written a manifest."
    else:
        mimic_status = "Not installed. Real-data evaluation on MIMIC-IV-ED is Pending."
    metadata = classical_metadata() or {}
    return {
        "product": "OPD Sentinel",
        "classical_available": classical_available(),
        "model": {
            "version": metadata.get("model_version"),
            "emergency_model": metadata.get("emergency_model"),
            "triage_model": metadata.get("triage_model"),
            "department_model": metadata.get("department_model"),
            "department_note": metadata.get("department_note"),
            "emergency_threshold": metadata.get("emergency_threshold"),
            "trained_on": (metadata.get("data_source") or {}).get("source_kind"),
            "train_rows": metadata.get("train_rows"),
        },
        "rules_clinically_reviewed": False,
        "rules_banner": "PLACEHOLDER — CLINICAL REVIEW REQUIRED",
        "data_source": str(manifest.get("source_kind", "Pending")),
        "dataset": manifest.get("dataset"),
        "dataset_licence": manifest.get("licence"),
        "dataset_doi": manifest.get("doi"),
        "dataset_rows": manifest.get("rows"),
        "split_counts": manifest.get("split_counts"),
        "evaluation_report": "present" if report.is_file() else "Pending",
        "mimic_iv_ed": mimic_status,
        "mimic_iv_ed_source": "https://physionet.org/content/mimic-iv-ed/",
        "audit": (
            "Append-only within the application's database permissions. "
            "Not cryptographically immutable."
        ),
        "wait_time_estimate": "unavailable",
        "complaint_note": (
            "The complaint is stored as typed. Normalised text is machine assistance, "
            "not a clinically validated translation."
        ),
    }


@router.get("/insights/datasets")
def insights(_user: AnyStaff) -> dict[str, Any]:
    """Descriptive statistics counted from the real public datasets on disk."""
    return dataset_insights()


@router.get("/demo/cases")
def demo_cases(_user: AnyStaff) -> dict[str, Any]:
    """Illustrative intakes. Not clinical outcomes."""
    config = load_demo_config()
    return {"banner": config["banner"], "cases": config["cases"]}


@router.get("/metrics")
def metrics(_user: AnyStaff) -> dict[str, Any]:
    """Serve reports/results.json. Missing file or cells stay Pending."""
    path = repo_root() / load_settings()["reports"]["json"]
    if not path.is_file():
        return {
            "status": "Pending",
            "evaluation_kind": "proxy, not official",
            "disclaimer": "make eval has not written reports/results.json.",
            "sections": {
                name: {"status": "Pending"}
                for name in (
                    "classical",
                    "nurse_reference",
                    "pipeline",
                    "runtime",
                    "robustness",
                    "fairness",
                    "queue_sim",
                )
            },
        }
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {"status": "Pending", "disclaimer": "results.json was not a JSON object."}
    return payload
