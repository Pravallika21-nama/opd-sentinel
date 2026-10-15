"""Persist encounters, predictions, nurse reviews, consultations, and prescriptions.

All three dashboards read the same rows. The prediction row is never edited:
nurse decisions, status changes, and doctor notes are new rows next to it.
Every important action appends an audit row with the acting user.
"""

from __future__ import annotations

import json
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import StaffUser
from app.db import (
    AuditRecord,
    CaseRecord,
    ConsultationRecord,
    EncounterStatusRecord,
    NurseReviewRecord,
    PatientIntakeRecord,
    PredictionRecord,
    PrescriptionRecord,
    allocate_opd_number,
    session_scope,
)
from app.schemas import (
    ConsultationRequest,
    ConsultationStatus,
    ConsultationStatusRequest,
    IntakeRequest,
    PrescriptionRequest,
    PrescriptionStatusRequest,
    QueueItem,
    ReviewRequest,
    ReviewStatus,
    SendToDoctorRequest,
    TriageResponse,
)
from app.services.pipeline import run_triage
from app.services.selfreport import self_report_for_case
from core.config_loader import load_demo_config

OPEN_STATUSES: frozenset[str] = frozenset(
    {"registered", "awaiting_doctor", "in_consultation", "prescription_recorded"}
)
WAITING_STATUSES: frozenset[str] = frozenset({"registered", "awaiting_doctor"})
DOCTOR_STATUSES: frozenset[str] = frozenset(
    {"awaiting_doctor", "in_consultation", "prescription_recorded"}
)
_CONSULTATION_EDITABLE: frozenset[str] = frozenset(
    {"in_consultation", "prescription_recorded", "referred"}
)
_CONSULTATION_FIELDS = (
    "examination_findings",
    "clinical_assessment",
    "diagnosis",
    "treatment_plan",
    "follow_up",
    "referral",
)


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _preview(complaint: str) -> str:
    text = complaint.strip()
    if len(text) <= 120:
        return text
    return text[:117] + "..."


def _stored_number(raw: dict[str, Any], key: str) -> float | None:
    """Return the stored number. Blank and non-numeric entries stay missing."""
    value = raw.get(key)
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _conflict(message: str) -> HTTPException:
    return HTTPException(status_code=409, detail={"message": message})


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail={"message": "Encounter not found."})


def _audit(
    session: Session,
    case_id: str,
    event: str,
    payload: dict[str, Any],
    actor: StaffUser | None,
    created: str | None = None,
) -> None:
    session.add(
        AuditRecord(
            case_id=case_id,
            created_at=created or _now(),
            event=event,
            payload_json=json.dumps(payload),
            actor=actor.username if actor else None,
            actor_role=actor.role if actor else None,
        )
    )


def _add_status(
    session: Session,
    case_id: str,
    status: ConsultationStatus,
    actor: StaffUser | None,
    note: str = "",
    created: str | None = None,
) -> None:
    session.add(
        EncounterStatusRecord(
            case_id=case_id,
            created_at=created or _now(),
            status=status,
            actor=actor.username if actor else None,
            actor_role=actor.role if actor else None,
            note=note,
        )
    )


def _current_status(session: Session, case_id: str) -> ConsultationStatus:
    row = session.scalar(
        select(EncounterStatusRecord)
        .where(EncounterStatusRecord.case_id == case_id)
        .order_by(EncounterStatusRecord.id.desc())
    )
    return _as_status(row.status if row else "registered")


def _as_status(value: str) -> ConsultationStatus:
    known: dict[str, ConsultationStatus] = {
        "registered": "registered",
        "awaiting_doctor": "awaiting_doctor",
        "in_consultation": "in_consultation",
        "prescription_recorded": "prescription_recorded",
        "referred": "referred",
        "completed": "completed",
    }
    return known.get(value, "registered")


def _require_case(session: Session, case_id: str) -> CaseRecord:
    case = session.get(CaseRecord, case_id)
    if case is None:
        raise _not_found()
    return case


# ---------------------------------------------------------------- registration


def triage_and_store(
    intake: IntakeRequest, *, case_id: str | None = None, actor: StaffUser | None = None
) -> TriageResponse:
    """Register one encounter, score it, store it, and append an audit row.

    The OPD number is allocated inside the same transaction as the case row.
    """
    raw = intake.model_dump(mode="json")
    illustrative = bool(intake.illustrative)
    decision, latency_ms = run_triage(raw, illustrative=illustrative)
    stored_id = case_id or f"case-{uuid.uuid4().hex[:12]}"
    arrival = intake.arrival_time.isoformat() if intake.arrival_time else _now()
    created = _now()
    payload = decision.model_dump(mode="json")
    with session_scope() as session:
        existing = session.get(CaseRecord, stored_id)
        if existing is None:
            opd_number = allocate_opd_number(session, created)
            session.add(
                CaseRecord(
                    id=stored_id,
                    created_at=created,
                    arrival_time=arrival,
                    raw_json=json.dumps(raw),
                    illustrative=1 if illustrative else 0,
                    complaint_preview=_preview(intake.complaint),
                    opd_number=opd_number,
                    patient_ref=intake.patient_ref or None,
                    patient_name=intake.patient_name or None,
                    registered_by=actor.username if actor else None,
                )
            )
            _add_status(session, stored_id, "registered", actor, "Registered", created)
            _audit(
                session,
                stored_id,
                "registration",
                {"opd_number": opd_number, "patient_ref": intake.patient_ref or None},
                actor,
                created,
            )
        else:
            opd_number = existing.opd_number or allocate_opd_number(session, existing.created_at)
            if not existing.opd_number:
                existing.opd_number = opd_number
        session.add(
            PredictionRecord(
                id=f"pred-{uuid.uuid4().hex[:12]}",
                case_id=stored_id,
                created_at=created,
                output_json=json.dumps(payload),
            )
        )
        _audit(
            session,
            stored_id,
            "triage",
            {"input": raw, "output": payload, "latency_ms": round(latency_ms, 2)},
            actor,
            created,
        )
        session.commit()
    return TriageResponse(
        case_id=stored_id,
        opd_number=opd_number,
        latency_ms=round(latency_ms, 2),
        assessed_at=created,
        **payload,
    )


# ---------------------------------------------------------------- queue


@dataclass
class _Bundle:
    predictions: dict[str, PredictionRecord] = field(default_factory=dict)
    reviews: dict[str, list[NurseReviewRecord]] = field(default_factory=lambda: defaultdict(list))
    statuses: dict[str, list[EncounterStatusRecord]] = field(
        default_factory=lambda: defaultdict(list)
    )
    prescriptions: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    via_portal: set[str] = field(default_factory=set)


def _load_bundle(session: Session) -> _Bundle:
    """One query per table instead of one per case."""
    bundle = _Bundle()
    for prediction in session.scalars(
        select(PredictionRecord).order_by(PredictionRecord.created_at.asc())
    ):
        bundle.predictions[prediction.case_id] = prediction
    for review in session.scalars(
        select(NurseReviewRecord).order_by(NurseReviewRecord.created_at.asc())
    ):
        bundle.reviews[review.case_id].append(review)
    for status in session.scalars(
        select(EncounterStatusRecord).order_by(EncounterStatusRecord.id.asc())
    ):
        bundle.statuses[status.case_id].append(status)
    for prescription in session.scalars(
        select(PrescriptionRecord).where(PrescriptionRecord.status == "active")
    ):
        bundle.prescriptions[prescription.case_id] += 1
    bundle.via_portal = {
        case_id
        for case_id in session.scalars(
            select(PatientIntakeRecord.case_id).where(PatientIntakeRecord.case_id.is_not(None))
        )
        if case_id
    }
    return bundle


def _consultation_started(statuses: list[EncounterStatusRecord]) -> str | None:
    for row in statuses:
        if row.status == "in_consultation":
            return row.created_at
    return None


def _build_item(case: CaseRecord, bundle: _Bundle, now: datetime) -> QueueItem:
    prediction = bundle.predictions.get(case.id)
    reviews = bundle.reviews.get(case.id, [])
    statuses = bundle.statuses.get(case.id, [])
    output = json.loads(prediction.output_json) if prediction else {}
    raw = json.loads(case.raw_json)
    review_status, level, department, reassessment = _queue_state(output, reviews)
    issues = output.get("validation_issues") or []
    warning = any(
        isinstance(item, dict) and item.get("status") not in {None, "ok"} for item in issues
    )
    arrival = _parse_time(case.arrival_time)
    started = _consultation_started(statuses)
    seen_at = _parse_time(started) if started else now
    wait = (seen_at - arrival).total_seconds()
    suggested = output.get("triage_level")
    return QueueItem(
        id=case.id,
        opd_number=case.opd_number or "",
        arrival_time=case.arrival_time,
        wait_seconds=max(0.0, round(wait, 1)),
        triage_level=level,
        suggested_level=int(suggested) if suggested is not None else None,
        department=department,
        abstain=bool(output.get("abstain")),
        illustrative=bool(case.illustrative),
        complaint_preview=case.complaint_preview,
        review_status=review_status,
        consultation_status=_as_status(statuses[-1].status if statuses else "registered"),
        source_label=output.get("source_label"),
        data_quality="warning" if warning else "ok",
        red_flag=bool(output.get("red_flags")),
        reassessment=reassessment,
        systolic_bp=_stored_number(raw, "systolic_bp"),
        diastolic_bp=_stored_number(raw, "diastolic_bp"),
        pulse=_stored_number(raw, "pulse"),
        temperature_c=_stored_number(raw, "temperature_c"),
        spo2=_stored_number(raw, "spo2"),
        nurse_notes=str(raw.get("nurse_notes") or ""),
        patient_ref=case.patient_ref or "",
        patient_name=case.patient_name or "",
        prescriptions=bundle.prescriptions.get(case.id, 0),
        via_portal=case.id in bundle.via_portal,
    )


def list_encounters() -> list[QueueItem]:
    """Every encounter, in priority order. Ranks are not assigned here."""
    now = datetime.now(UTC)
    with session_scope() as session:
        bundle = _load_bundle(session)
        cases = session.scalars(select(CaseRecord)).all()
        items = [_build_item(case, bundle, now) for case in cases]
    items.sort(key=_queue_key)
    return items


def list_queue(*, include_closed: bool = False) -> list[QueueItem]:
    """Priority order: abstentions and levels 1–2 first, then level, then arrival.

    A Nurse Review level replaces the suggestion in the working order.
    A reassessment request does not change urgency. Referred and completed
    encounters are left out unless `include_closed` is set.
    """
    items = [
        item
        for item in list_encounters()
        if include_closed or item.consultation_status in OPEN_STATUSES
    ]
    return _ranked(items)


def doctor_queue() -> list[QueueItem]:
    """Encounters the nurse has sent to the doctor, in the same priority order."""
    return _ranked(
        [item for item in list_encounters() if item.consultation_status in DOCTOR_STATUSES]
    )


def _ranked(items: list[QueueItem]) -> list[QueueItem]:
    """Number the priority order and the first-come-first-served order of the same list.

    The OPD number never changes. `rank` moves with severity; `arrival_position`
    is where the patient would stand if the queue were first-come-first-served.
    """
    by_arrival = sorted(items, key=lambda item: (item.arrival_time, item.id))
    arrival_index = {item.id: index for index, item in enumerate(by_arrival, start=1)}
    for index, item in enumerate(items, start=1):
        item.rank = index
        item.arrival_position = arrival_index[item.id]
        item.position_reason = _position_reason(item)
    return items


def queue_place(case_id: str) -> dict[str, int] | None:
    """Where one open encounter stands among patients waiting at the same step.

    Nurse-review waiters are counted in the main queue and doctor waiters in the
    doctor queue. Patients already in consultation are not counted as ahead.
    """
    for items, waiting in ((doctor_queue(), "awaiting_doctor"), (list_queue(), "registered")):
        same_step = [item for item in items if item.consultation_status == waiting]
        for index, item in enumerate(same_step, start=1):
            if item.id == case_id:
                return {"position": index, "waiting": len(same_step)}
    return None


# ---------------------------------------------------------------- encounter detail


def get_case(case_id: str) -> dict[str, Any]:
    """The stored intake, decision, nurse reviews, status history, notes, and prescriptions."""
    with session_scope() as session:
        case = _require_case(session, case_id)
        prediction = _latest_prediction(session, case_id)
        output = json.loads(prediction.output_json) if prediction else None
        reviews = session.scalars(
            select(NurseReviewRecord)
            .where(NurseReviewRecord.case_id == case_id)
            .order_by(NurseReviewRecord.created_at.asc())
        ).all()
        statuses = session.scalars(
            select(EncounterStatusRecord)
            .where(EncounterStatusRecord.case_id == case_id)
            .order_by(EncounterStatusRecord.id.asc())
        ).all()
        consultations = session.scalars(
            select(ConsultationRecord)
            .where(ConsultationRecord.case_id == case_id)
            .order_by(ConsultationRecord.created_at.asc())
        ).all()
        prescriptions = session.scalars(
            select(PrescriptionRecord)
            .where(PrescriptionRecord.case_id == case_id)
            .order_by(PrescriptionRecord.created_at.asc())
        ).all()
        review_status, level, department, reassessment = _queue_state(output or {}, list(reviews))
        previous: list[dict[str, Any]] = []
        if case.patient_ref:
            others = session.scalars(
                select(CaseRecord)
                .where(CaseRecord.patient_ref == case.patient_ref, CaseRecord.id != case.id)
                .order_by(CaseRecord.arrival_time.desc())
            ).all()
            for other in others:
                latest_note = session.scalar(
                    select(ConsultationRecord)
                    .where(ConsultationRecord.case_id == other.id)
                    .order_by(ConsultationRecord.created_at.desc())
                )
                previous.append(
                    {
                        "case_id": other.id,
                        "opd_number": other.opd_number or "",
                        "arrival_time": other.arrival_time,
                        "complaint_preview": other.complaint_preview,
                        "consultation_status": _current_status(session, other.id),
                        "diagnosis": latest_note.diagnosis if latest_note else "",
                    }
                )
        raw = json.loads(case.raw_json)
        latest = consultations[-1] if consultations else None
        return {
            "case_id": case.id,
            "opd_number": case.opd_number or "",
            "arrival_time": case.arrival_time,
            "registered_at": case.created_at,
            "registered_by": case.registered_by,
            "patient_ref": case.patient_ref or "",
            "patient_name": case.patient_name or "",
            "illustrative": bool(case.illustrative),
            "input": raw,
            "decision": output,
            "assessed_at": prediction.created_at if prediction else None,
            "review_status": review_status,
            "working_level": level,
            "working_department": department,
            "reassessment": reassessment,
            "consultation_status": _as_status(statuses[-1].status if statuses else "registered"),
            "status_history": [
                {
                    "status": row.status,
                    "created_at": row.created_at,
                    "actor": row.actor,
                    "actor_role": row.actor_role,
                    "note": row.note,
                }
                for row in statuses
            ],
            "reviews": [
                {
                    "action": review.action,
                    "triage_level": review.triage_level,
                    "department": review.department,
                    "reason": review.reason,
                    "created_at": review.created_at,
                }
                for review in reviews
            ],
            "consultation": _consultation_dict(latest) if latest else None,
            "consultation_versions": len(consultations),
            "prescriptions": [_prescription_dict(row) for row in prescriptions],
            "previous_encounters": previous,
            "self_report": self_report_for_case(session, case_id),
        }


def _consultation_dict(row: ConsultationRecord) -> dict[str, Any]:
    return {
        "id": row.id,
        "created_at": row.created_at,
        "doctor_name": row.doctor_name,
        **{name: getattr(row, name) for name in _CONSULTATION_FIELDS},
    }


def _prescription_dict(row: PrescriptionRecord) -> dict[str, Any]:
    return {
        "id": row.id,
        "case_id": row.case_id,
        "created_at": row.created_at,
        "prescriber_name": row.prescriber_name,
        "medication": row.medication,
        "dose": row.dose,
        "dose_unit": row.dose_unit,
        "route": row.route,
        "frequency": row.frequency,
        "duration": row.duration,
        "instructions": row.instructions,
        "status": row.status,
        "status_changed_at": row.status_changed_at,
        "status_reason": row.status_reason,
    }


# ---------------------------------------------------------------- nurse actions


def review_case(
    case_id: str, review: ReviewRequest, actor: StaffUser | None = None
) -> dict[str, Any]:
    """Append a Nurse Review. Does not edit the prediction row.

    Escalation also sends a registered encounter straight to the doctor queue,
    so an emergency does not wait for a separate hand-off.
    """
    with session_scope() as session:
        _require_case(session, case_id)
        status = _current_status(session, case_id)
        if status not in OPEN_STATUSES:
            raise _conflict(
                f"This encounter is {status.replace('_', ' ')}. Nurse Review is closed."
            )
        prediction = _latest_prediction(session, case_id)
        output = json.loads(prediction.output_json) if prediction else {}
        level, department, event = _review_decision(review, output)
        created = _now()
        session.add(
            NurseReviewRecord(
                id=f"rev-{uuid.uuid4().hex[:12]}",
                case_id=case_id,
                created_at=created,
                action=review.action,
                triage_level=level,
                department=department,
                reason=review.reason,
            )
        )
        _audit(
            session,
            case_id,
            event,
            {
                "action": review.action,
                "triage_level": level,
                "suggested_level": output.get("triage_level"),
                "department": department,
                "reason": review.reason,
                "actor": "nurse",
            },
            actor,
            created,
        )
        sent = False
        if review.action == "escalate" and status == "registered":
            _add_status(session, case_id, "awaiting_doctor", actor, "Escalated by nurse", created)
            _audit(
                session,
                case_id,
                "send_to_doctor",
                {"note": "Escalated by nurse", "automatic": True},
                actor,
                created,
            )
            sent = True
        session.commit()
    return {
        "case_id": case_id,
        "action": review.action,
        "triage_level": level,
        "department": department,
        "sent_to_doctor": sent,
    }


def send_to_doctor(
    case_id: str, request: SendToDoctorRequest, actor: StaffUser | None
) -> dict[str, Any]:
    """Move a reviewed encounter to the doctor queue."""
    with session_scope() as session:
        _require_case(session, case_id)
        status = _current_status(session, case_id)
        if status != "registered":
            raise _conflict(f"This encounter is already {status.replace('_', ' ')}.")
        reviews = session.scalars(
            select(NurseReviewRecord)
            .where(NurseReviewRecord.case_id == case_id)
            .order_by(NurseReviewRecord.created_at)
        ).all()
        if not reviews or reviews[-1].action == "reassess":
            raise _conflict(
                "Confirm, override, or escalate the triage level before sending to the doctor."
            )
        created = _now()
        _add_status(session, case_id, "awaiting_doctor", actor, request.note, created)
        _audit(session, case_id, "send_to_doctor", {"note": request.note}, actor, created)
        session.commit()
    return {"case_id": case_id, "consultation_status": "awaiting_doctor"}


# ---------------------------------------------------------------- doctor actions


def start_consultation(case_id: str, actor: StaffUser) -> dict[str, Any]:
    """Doctor opens the consultation. Repeating the call is harmless."""
    with session_scope() as session:
        _require_case(session, case_id)
        status = _current_status(session, case_id)
        if status in _CONSULTATION_EDITABLE:
            return {"case_id": case_id, "consultation_status": status}
        if status != "awaiting_doctor":
            raise _conflict(
                "Only encounters awaiting the doctor can be started. "
                f"This one is {status.replace('_', ' ')}."
            )
        created = _now()
        _add_status(session, case_id, "in_consultation", actor, "Consultation started", created)
        _audit(session, case_id, "consultation_started", {}, actor, created)
        session.commit()
    return {"case_id": case_id, "consultation_status": "in_consultation"}


def save_consultation(
    case_id: str, request: ConsultationRequest, actor: StaffUser
) -> dict[str, Any]:
    """Append a new version of the doctor's note."""
    values = {name: getattr(request, name).strip() for name in _CONSULTATION_FIELDS}
    if not any(values.values()):
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Enter at least one consultation field before saving.",
                "errors": [{"field": "examination_findings", "message": "Nothing to save."}],
            },
        )
    with session_scope() as session:
        _require_case(session, case_id)
        status = _current_status(session, case_id)
        if status not in _CONSULTATION_EDITABLE:
            raise _conflict("Start the consultation before saving notes.")
        created = _now()
        record = ConsultationRecord(
            id=f"cons-{uuid.uuid4().hex[:12]}",
            case_id=case_id,
            created_at=created,
            doctor_id=actor.id,
            doctor_name=actor.display_name,
            **values,
        )
        session.add(record)
        _audit(
            session,
            case_id,
            "consultation_saved",
            {"consultation_id": record.id, **values},
            actor,
            created,
        )
        session.commit()
        return _consultation_dict(record)


def set_consultation_status(
    case_id: str, request: ConsultationStatusRequest, actor: StaffUser
) -> dict[str, Any]:
    """Refer or complete. Each needs the matching doctor-entered field."""
    with session_scope() as session:
        _require_case(session, case_id)
        status = _current_status(session, case_id)
        latest = session.scalar(
            select(ConsultationRecord)
            .where(ConsultationRecord.case_id == case_id)
            .order_by(ConsultationRecord.created_at.desc())
        )
        if request.status == "referred":
            if status not in {"in_consultation", "prescription_recorded"}:
                raise _conflict("Only an open consultation can be referred.")
            if latest is None or not latest.referral.strip():
                raise _conflict("Save referral details in the consultation before referring.")
        else:
            if status not in _CONSULTATION_EDITABLE:
                raise _conflict("Only an open or referred consultation can be completed.")
            if latest is None or not (
                latest.diagnosis.strip() or latest.clinical_assessment.strip()
            ):
                raise _conflict(
                    "Save a clinical assessment or diagnosis before completing the consultation."
                )
        created = _now()
        _add_status(session, case_id, request.status, actor, request.note, created)
        _audit(
            session,
            case_id,
            f"consultation_{request.status}",
            {"note": request.note, "from": status},
            actor,
            created,
        )
        session.commit()
    return {"case_id": case_id, "consultation_status": request.status}


def add_prescription(
    case_id: str, request: PrescriptionRequest, actor: StaffUser
) -> dict[str, Any]:
    """Record one doctor-entered prescription line."""
    with session_scope() as session:
        _require_case(session, case_id)
        status = _current_status(session, case_id)
        if status not in {"in_consultation", "prescription_recorded"}:
            raise _conflict("Prescriptions can only be added during an open consultation.")
        created = _now()
        record = PrescriptionRecord(
            id=f"rx-{uuid.uuid4().hex[:12]}",
            case_id=case_id,
            created_at=created,
            prescriber_id=actor.id,
            prescriber_name=actor.display_name,
            medication=request.medication,
            dose=request.dose,
            dose_unit=request.dose_unit,
            route=request.route,
            frequency=request.frequency,
            duration=request.duration,
            instructions=request.instructions.strip(),
            status="active",
        )
        session.add(record)
        if status == "in_consultation":
            _add_status(
                session, case_id, "prescription_recorded", actor, "Prescription recorded", created
            )
        _audit(
            session,
            case_id,
            "prescription_created",
            {"prescription": _prescription_dict(record)},
            actor,
            created,
        )
        session.commit()
        return _prescription_dict(record)


def change_prescription(
    prescription_id: str, request: PrescriptionStatusRequest, actor: StaffUser
) -> dict[str, Any]:
    """Cancel an active prescription line. The row is kept with its reason."""
    with session_scope() as session:
        record = session.get(PrescriptionRecord, prescription_id)
        if record is None:
            raise HTTPException(status_code=404, detail={"message": "Prescription not found."})
        status = _current_status(session, record.case_id)
        if status == "completed":
            raise _conflict("The consultation is completed. Prescriptions are locked.")
        if record.status != "active":
            raise _conflict("Only an active prescription can be cancelled.")
        created = _now()
        record.status = "cancelled"
        record.status_changed_at = created
        record.status_reason = request.reason
        _audit(
            session,
            record.case_id,
            "prescription_cancelled",
            {"prescription_id": record.id, "reason": request.reason},
            actor,
            created,
        )
        session.commit()
        return _prescription_dict(record)


# ---------------------------------------------------------------- audit and demo


def list_audit(case_id: str | None = None, limit: int = 500) -> list[dict[str, Any]]:
    """Return audit rows in append order. Without a case, the most recent `limit` rows."""
    with session_scope() as session:
        if case_id:
            query = (
                select(AuditRecord)
                .where(AuditRecord.case_id == case_id)
                .order_by(AuditRecord.id.asc())
            )
            rows = list(session.scalars(query).all())
        else:
            query = select(AuditRecord).order_by(AuditRecord.id.desc()).limit(limit)
            rows = list(reversed(session.scalars(query).all()))
        return [
            {
                "id": row.id,
                "case_id": row.case_id,
                "created_at": row.created_at,
                "event": row.event,
                "actor": row.actor,
                "actor_role": row.actor_role,
                "payload": json.loads(row.payload_json),
            }
            for row in rows
        ]


def seed_demo_cases() -> int:
    """Insert illustrative cases that are not already stored. Returns the number added."""
    config = load_demo_config()
    added = 0
    for case in config["cases"]:
        with session_scope() as session:
            if session.get(CaseRecord, case["id"]) is not None:
                continue
        intake = IntakeRequest(**case["intake"], illustrative=True)
        triage_and_store(intake, case_id=case["id"])
        added += 1
    return added


# ---------------------------------------------------------------- helpers


def _review_decision(
    review: ReviewRequest, output: dict[str, Any]
) -> tuple[int | None, str | None, str]:
    """Return the stored level, department, and audit event for a Nurse Review."""
    if review.action == "reassess":
        return None, output.get("department"), "reassess"
    if review.action == "escalate":
        return 1, review.department or output.get("department"), "escalate"
    if review.action == "override":
        if review.triage_level is None:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "An override needs a triage level.",
                    "errors": [{"field": "triage_level", "message": "Required when overriding."}],
                },
            )
        return review.triage_level, review.department or output.get("department"), "nurse_review"
    suggested = output.get("triage_level")
    level = int(suggested) if suggested is not None else None
    if level is None:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "There is no suggested level to confirm. Override with a level instead.",
                "errors": [
                    {
                        "field": "triage_level",
                        "message": "Required because the suggestion abstained.",
                    }
                ],
            },
        )
    return level, output.get("department"), "nurse_review"


def _queue_state(
    output: dict[str, Any], reviews: list[NurseReviewRecord]
) -> tuple[ReviewStatus, int | None, str | None, Literal["none", "requested"]]:
    """Working level and department, review status, and a later reassessment request."""
    suggested = output.get("triage_level")
    level = int(suggested) if suggested is not None else None
    department: str | None = output.get("department")
    status: ReviewStatus = "pending"
    decision_at = ""
    for review in reviews:
        if review.action == "reassess":
            continue
        decision_at = review.created_at
        if review.triage_level is not None:
            level = review.triage_level
        if review.department:
            department = review.department
        if review.action == "override":
            status = "overridden"
        elif review.action == "escalate":
            status = "escalated"
        else:
            status = "confirmed"
    reassessment: Literal["none", "requested"] = "none"
    if any(review.action == "reassess" and review.created_at >= decision_at for review in reviews):
        reassessment = "requested"
    return status, level, department, reassessment


def _position_reason(item: QueueItem) -> str:
    """Explain the working order. This is not a predicted waiting time."""
    if item.abstain and item.triage_level is None:
        reason = "Ahead of routine cases because the case could not be assessed."
    elif item.review_status == "escalated":
        reason = "Nurse Review escalated this case to level 1."
    elif item.review_status == "overridden":
        reason = (
            f"Nurse Review set level {item.triage_level}. "
            "Within the same level, earlier arrival is ahead."
        )
    elif item.review_status == "confirmed" and item.triage_level is not None:
        reason = (
            f"Nurse Review confirmed level {item.triage_level}. "
            "Within the same level, earlier arrival is ahead."
        )
    elif item.triage_level is not None and item.triage_level <= 2:
        reason = (
            f"Suggested level {item.triage_level} is pinned ahead of routine cases. "
            "Within the same level, earlier arrival is ahead."
        )
    elif item.triage_level is not None:
        reason = (
            f"Suggested level {item.triage_level}. Within the same level, earlier arrival is ahead."
        )
    else:
        reason = "No level yet. The case stays visible for Nurse Review."
    if item.reassessment == "requested":
        reason += " Reassessment was requested. A timer does not change urgency."
    return reason


def _latest_prediction(session: Session, case_id: str) -> PredictionRecord | None:
    return session.scalar(
        select(PredictionRecord)
        .where(PredictionRecord.case_id == case_id)
        .order_by(PredictionRecord.created_at.desc())
    )


def _queue_key(item: QueueItem) -> tuple[int, int, str]:
    pin = 0 if item.abstain or (item.triage_level is not None and item.triage_level <= 2) else 1
    level = item.triage_level if item.triage_level is not None else 9
    return (pin, level, item.arrival_time)
