"""Patient self check-in and nurse verification.

A patient's answers are self-reported. They never reach the model directly:
a nurse sees the patient, measures vitals, and registers the encounter, which
then runs through the same triage pipeline as a walk-in. Patients can read
their own check-ins and the doctor's visit summary, never another patient's
records and never the model output.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.auth import StaffUser, create_user, login, validate_username
from app.db import (
    AuditRecord,
    CaseRecord,
    ConsultationRecord,
    EncounterStatusRecord,
    PatientIntakeRecord,
    PrescriptionRecord,
    session_scope,
)
from app.schemas import (
    CheckinRegisterRequest,
    CheckinReturnRequest,
    PatientIntakeRequest,
    PatientSignupRequest,
)
from app.services.selfreport import checkin_dict
from app.services.store import queue_place, triage_and_store
from app.settings import get_settings
from core.red_flags import find_red_flags

# "registering" is held only while the nurse's registration is being stored.
CHECKIN_STATUSES = ("submitted", "registering", "registered", "returned", "withdrawn")
_SUMMARY_STATUSES = frozenset({"referred", "completed"})
_WAITING_STATUSES = frozenset({"registered", "awaiting_doctor"})
_SELF_VITALS = (
    "self_temperature_c",
    "self_pulse",
    "self_systolic_bp",
    "self_diastolic_bp",
    "self_spo2",
)


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail={"message": "Check-in not found."})


def _conflict(message: str) -> HTTPException:
    return HTTPException(status_code=409, detail={"message": message})


def _audit(
    session: Session, record_id: str, event: str, payload: dict[str, Any], actor: StaffUser
) -> None:
    session.add(
        AuditRecord(
            case_id=record_id,
            created_at=_now(),
            event=event,
            payload_json=json.dumps(payload),
            actor=actor.username,
            actor_role=actor.role,
        )
    )


def patient_ref_for(user: StaffUser) -> str:
    """Stable reference that links every encounter of one portal account."""
    return "PT-" + user.id.removeprefix("user-").upper()


# ---------------------------------------------------------------- accounts


def register_patient(body: PatientSignupRequest) -> tuple[str, StaffUser, str]:
    """Create a patient account and sign it in."""
    if not get_settings().patient_signup:
        raise HTTPException(
            status_code=403, detail={"message": "Patient sign-up is turned off at this clinic."}
        )
    try:
        username = validate_username(body.username)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"message": str(exc), "errors": [{"field": "username", "message": str(exc)}]},
        ) from exc
    try:
        create_user(username, body.display_name, "patient", body.password)
    except ValueError as exc:
        raise _conflict("That username is taken. Choose another.") from exc
    token, user, expires = login(username, body.password)
    with session_scope() as session:
        _audit(session, "account", "patient_signup", {"username": username}, user)
        session.commit()
    return token, user, expires


# ---------------------------------------------------------------- patient side


def _encounter_progress(session: Session, case_id: str) -> dict[str, Any]:
    statuses = session.scalars(
        select(EncounterStatusRecord)
        .where(EncounterStatusRecord.case_id == case_id)
        .order_by(EncounterStatusRecord.id.asc())
    ).all()
    case = session.get(CaseRecord, case_id)
    current = statuses[-1].status if statuses else "registered"
    progress: dict[str, Any] = {
        "opd_number": case.opd_number if case else "",
        "consultation_status": current,
        "timeline": [{"status": row.status, "at": row.created_at} for row in statuses],
        "visit_summary": None,
        "queue_place": queue_place(case_id) if current in _WAITING_STATUSES else None,
    }
    if current in _SUMMARY_STATUSES:
        note = session.scalar(
            select(ConsultationRecord)
            .where(ConsultationRecord.case_id == case_id)
            .order_by(ConsultationRecord.created_at.desc())
        )
        prescriptions = session.scalars(
            select(PrescriptionRecord)
            .where(PrescriptionRecord.case_id == case_id, PrescriptionRecord.status == "active")
            .order_by(PrescriptionRecord.created_at.asc())
        ).all()
        progress["visit_summary"] = {
            "doctor_name": note.doctor_name if note else "",
            "diagnosis": note.diagnosis if note else "",
            "treatment_plan": note.treatment_plan if note else "",
            "follow_up": note.follow_up if note else "",
            "referral": note.referral if note else "",
            "prescriptions": [
                {
                    "medication": row.medication,
                    "dose": row.dose,
                    "dose_unit": row.dose_unit,
                    "route": row.route,
                    "frequency": row.frequency,
                    "duration": row.duration,
                    "instructions": row.instructions,
                }
                for row in prescriptions
            ],
        }
    return progress


def _patient_view(session: Session, row: PatientIntakeRecord) -> dict[str, Any]:
    view = checkin_dict(row)
    view.pop("reviewed_by")
    view["encounter"] = _encounter_progress(session, row.case_id) if row.case_id else None
    return view


def create_checkin(user: StaffUser, body: PatientIntakeRequest) -> dict[str, Any]:
    """Store a self check-in. Red-flag words are matched so the patient sees safety advice."""
    limit = get_settings().patient_open_checkins
    flags = find_red_flags(body.symptoms)
    with session_scope() as session:
        waiting = session.scalar(
            select(func.count())
            .select_from(PatientIntakeRecord)
            .where(
                PatientIntakeRecord.patient_user_id == user.id,
                PatientIntakeRecord.status == "submitted",
            )
        )
        if (waiting or 0) >= limit:
            raise _conflict(
                f"You already have {waiting} check-in(s) waiting for a nurse. "
                "Withdraw one or wait for the nurse."
            )
        record = PatientIntakeRecord(
            id=f"pin-{uuid.uuid4().hex[:12]}",
            created_at=_now(),
            patient_user_id=user.id,
            patient_ref=patient_ref_for(user),
            full_name=body.full_name,
            age=body.age,
            sex=body.sex,
            preferred_language=body.preferred_language,
            symptoms=body.symptoms,
            symptom_duration=body.symptom_duration,
            severity=body.severity,
            known_conditions=body.known_conditions,
            medications=body.medications,
            allergies=body.allergies,
            self_vitals_json=json.dumps(
                {
                    name: getattr(body, name)
                    for name in _SELF_VITALS
                    if getattr(body, name) is not None
                }
            ),
            red_flags_json=json.dumps([{"id": flag.id, "label": flag.label} for flag in flags]),
            status="submitted",
        )
        session.add(record)
        _audit(
            session,
            record.id,
            "patient_checkin",
            {"red_flags": [flag.id for flag in flags]},
            user,
        )
        session.commit()
        return _patient_view(session, record)


def _own(session: Session, user: StaffUser, checkin_id: str) -> PatientIntakeRecord:
    row = session.get(PatientIntakeRecord, checkin_id)
    if row is None or row.patient_user_id != user.id:
        raise _not_found()
    return row


def list_own_checkins(user: StaffUser) -> list[dict[str, Any]]:
    with session_scope() as session:
        rows = session.scalars(
            select(PatientIntakeRecord)
            .where(PatientIntakeRecord.patient_user_id == user.id)
            .order_by(PatientIntakeRecord.created_at.desc())
        ).all()
        return [_patient_view(session, row) for row in rows]


def get_own_checkin(user: StaffUser, checkin_id: str) -> dict[str, Any]:
    with session_scope() as session:
        return _patient_view(session, _own(session, user, checkin_id))


def withdraw_checkin(user: StaffUser, checkin_id: str) -> dict[str, Any]:
    with session_scope() as session:
        row = _own(session, user, checkin_id)
        if row.status != "submitted":
            raise _conflict("Only a check-in that is still waiting can be withdrawn.")
        row.status = "withdrawn"
        row.status_note = "Withdrawn by the patient"
        _audit(session, row.id, "patient_withdraw", {}, user)
        session.commit()
        return _patient_view(session, row)


# ---------------------------------------------------------------- nurse side


def _staff_view(session: Session, row: PatientIntakeRecord) -> dict[str, Any]:
    view = checkin_dict(row)
    previous = session.scalar(
        select(func.count())
        .select_from(PatientIntakeRecord)
        .where(
            PatientIntakeRecord.patient_ref == row.patient_ref,
            PatientIntakeRecord.status == "registered",
            PatientIntakeRecord.id != row.id,
        )
    )
    view["previous_visits"] = int(previous or 0)
    view["encounter"] = _encounter_progress(session, row.case_id) if row.case_id else None
    return view


def list_checkins(status: str | None) -> list[dict[str, Any]]:
    """Check-ins for the nurse desk. Waiting ones with red-flag words first, then oldest."""
    with session_scope() as session:
        query = select(PatientIntakeRecord)
        if status:
            query = query.where(PatientIntakeRecord.status == status)
        rows = session.scalars(query).all()
        views = [_staff_view(session, row) for row in rows]
    waiting = sorted(
        (view for view in views if view["status"] == "submitted"),
        key=lambda view: (not view["red_flags"], view["created_at"]),
    )
    others = sorted(
        (view for view in views if view["status"] != "submitted"),
        key=lambda view: view["created_at"],
        reverse=True,
    )
    return waiting + others


def get_checkin(checkin_id: str) -> dict[str, Any]:
    with session_scope() as session:
        row = session.get(PatientIntakeRecord, checkin_id)
        if row is None:
            raise _not_found()
        return _staff_view(session, row)


def register_checkin(
    checkin_id: str, body: CheckinRegisterRequest, nurse: StaffUser
) -> dict[str, Any]:
    """Claim the check-in, register the encounter with measured vitals, and link them.

    The claim is a conditional update, so two nurses cannot register it twice.
    """
    with session_scope() as session:
        row = session.get(PatientIntakeRecord, checkin_id)
        if row is None:
            raise _not_found()
        claimed = session.execute(
            update(PatientIntakeRecord)
            .where(
                PatientIntakeRecord.id == checkin_id,
                PatientIntakeRecord.status == "submitted",
            )
            .values(status="registering", reviewed_by=nurse.username, reviewed_at=_now())
        )
        session.commit()
        if getattr(claimed, "rowcount", 0) != 1:
            raise _conflict(f"This check-in is already {row.status}.")
        patient_ref = row.patient_ref
        full_name = row.full_name
    intake = body.intake.model_copy(
        update={
            "patient_ref": patient_ref,
            "patient_name": body.intake.patient_name or full_name,
            "illustrative": False,
        }
    )
    try:
        result = triage_and_store(intake, actor=nurse)
    except Exception:
        with session_scope() as session:
            session.execute(
                update(PatientIntakeRecord)
                .where(PatientIntakeRecord.id == checkin_id)
                .values(status="submitted", reviewed_by=None, reviewed_at=None)
            )
            session.commit()
        raise
    with session_scope() as session:
        row = session.get(PatientIntakeRecord, checkin_id)
        if row is None:
            raise _not_found()
        row.status = "registered"
        row.case_id = result.case_id
        row.status_note = f"Registered as {result.opd_number}"
        _audit(
            session,
            checkin_id,
            "checkin_registered",
            {
                "case_id": result.case_id,
                "opd_number": result.opd_number,
                "identity_confirmed": True,
            },
            nurse,
        )
        _audit(
            session,
            result.case_id,
            "checkin_linked",
            {"checkin_id": checkin_id},
            nurse,
        )
        session.commit()
        view = _staff_view(session, row)
    return {"checkin": view, "triage": result.model_dump(mode="json")}


def return_checkin(checkin_id: str, body: CheckinReturnRequest, nurse: StaffUser) -> dict[str, Any]:
    """Send a waiting check-in back to the patient with a reason they can read."""
    with session_scope() as session:
        row = session.get(PatientIntakeRecord, checkin_id)
        if row is None:
            raise _not_found()
        if row.status != "submitted":
            raise _conflict(f"This check-in is already {row.status}.")
        row.status = "returned"
        row.status_note = body.reason
        row.reviewed_by = nurse.username
        row.reviewed_at = _now()
        _audit(session, row.id, "checkin_returned", {"reason": body.reason}, nurse)
        session.commit()
        return _staff_view(session, row)
