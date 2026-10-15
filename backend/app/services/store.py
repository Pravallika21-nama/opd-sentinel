"""Persist cases, predictions, nurse reviews, and the append-only audit log."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import select

from app.db import (
    AuditRecord,
    CaseRecord,
    NurseReviewRecord,
    PredictionRecord,
    allocate_opd_number,
    session_scope,
)
from app.schemas import IntakeRequest, QueueItem, ReviewRequest, TriageResponse
from app.services.pipeline import run_triage
from core.config_loader import load_demo_config


def _now() -> str:
    return datetime.now(UTC).isoformat()


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


def triage_and_store(intake: IntakeRequest, *, case_id: str | None = None) -> TriageResponse:
    """Score one intake, store it, and append an audit row."""
    raw = intake.model_dump(mode="json")
    illustrative = bool(intake.illustrative)
    decision, latency_ms = run_triage(raw, illustrative=illustrative)
    stored_id = case_id or f"case-{uuid.uuid4().hex[:12]}"
    arrival = intake.arrival_time.isoformat() if intake.arrival_time else _now()
    created = _now()
    payload = decision.model_dump(mode="json")
    opd_number = ""
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
                )
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
        session.add(
            AuditRecord(
                case_id=stored_id,
                created_at=created,
                event="triage",
                payload_json=json.dumps(
                    {"input": raw, "output": payload, "latency_ms": round(latency_ms, 2)}
                ),
            )
        )
        session.commit()
    return TriageResponse(
        case_id=stored_id,
        opd_number=opd_number,
        latency_ms=round(latency_ms, 2),
        **payload,
    )


def list_queue() -> list[QueueItem]:
    """Priority order: abstentions and levels 1–2 first, then level, then arrival.

    A Nurse Review level replaces the suggestion in the working order.
    A reassessment request does not change urgency.
    """
    with session_scope() as session:
        cases = session.scalars(select(CaseRecord)).all()
        items: list[QueueItem] = []
        for case in cases:
            prediction = _latest_prediction(session, case.id)
            reviews = list(
                session.scalars(
                    select(NurseReviewRecord)
                    .where(NurseReviewRecord.case_id == case.id)
                    .order_by(NurseReviewRecord.created_at.asc())
                ).all()
            )
            output = json.loads(prediction.output_json) if prediction else {}
            raw = json.loads(case.raw_json)
            status, level, reassessment = _queue_state(output, reviews)
            issues = output.get("validation_issues") or []
            warning = any(
                isinstance(item, dict) and item.get("status") not in {None, "ok"} for item in issues
            )
            arrival = datetime.fromisoformat(case.arrival_time)
            if arrival.tzinfo is None:
                arrival = arrival.replace(tzinfo=UTC)
            wait = (datetime.now(UTC) - arrival).total_seconds()
            suggested = output.get("triage_level")
            items.append(
                QueueItem(
                    id=case.id,
                    opd_number=case.opd_number or "",
                    arrival_time=case.arrival_time,
                    wait_seconds=max(0.0, round(wait, 1)),
                    triage_level=level,
                    suggested_level=int(suggested) if suggested is not None else None,
                    department=output.get("department"),
                    abstain=bool(output.get("abstain")),
                    illustrative=bool(case.illustrative),
                    complaint_preview=case.complaint_preview,
                    review_status=status,
                    source_label=output.get("source_label"),
                    data_quality="warning" if warning else "ok",
                    red_flag=bool(output.get("red_flags")),
                    reassessment=reassessment,
                    systolic_bp=_stored_number(raw, "systolic_bp"),
                    diastolic_bp=_stored_number(raw, "diastolic_bp"),
                    pulse=_stored_number(raw, "pulse"),
                    temperature_c=_stored_number(raw, "temperature_c"),
                    spo2=_stored_number(raw, "spo2"),
                )
            )
    items.sort(key=_queue_key)
    for index, item in enumerate(items, start=1):
        item.rank = index
        item.position_reason = _position_reason(item)
    return items


def get_case(case_id: str) -> dict[str, Any]:
    """Return the stored intake, the latest decision, and reviews."""
    with session_scope() as session:
        case = session.get(CaseRecord, case_id)
        if case is None:
            raise HTTPException(status_code=404, detail="Case not found")
        prediction = _latest_prediction(session, case_id)
        reviews = session.scalars(
            select(NurseReviewRecord).where(NurseReviewRecord.case_id == case_id)
        ).all()
        return {
            "case_id": case.id,
            "opd_number": case.opd_number or "",
            "arrival_time": case.arrival_time,
            "illustrative": bool(case.illustrative),
            "input": json.loads(case.raw_json),
            "decision": json.loads(prediction.output_json) if prediction else None,
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
        }


def review_case(case_id: str, review: ReviewRequest) -> dict[str, Any]:
    """Append a Nurse Review. Does not edit the prediction row."""
    with session_scope() as session:
        case = session.get(CaseRecord, case_id)
        if case is None:
            raise HTTPException(status_code=404, detail="Case not found")
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
        session.add(
            AuditRecord(
                case_id=case_id,
                created_at=created,
                event=event,
                payload_json=json.dumps(
                    {
                        "action": review.action,
                        "triage_level": level,
                        "suggested_level": output.get("triage_level"),
                        "department": department,
                        "reason": review.reason,
                        "actor": "nurse",
                    }
                ),
            )
        )
        session.commit()
    return {
        "case_id": case_id,
        "action": review.action,
        "triage_level": level,
        "department": department,
    }


def list_audit(case_id: str | None = None) -> list[dict[str, Any]]:
    """Return audit rows in append order."""
    with session_scope() as session:
        query = select(AuditRecord).order_by(AuditRecord.id.asc())
        if case_id:
            query = query.where(AuditRecord.case_id == case_id)
        rows = session.scalars(query).all()
        return [
            {
                "id": row.id,
                "case_id": row.case_id,
                "created_at": row.created_at,
                "event": row.event,
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


def _review_decision(
    review: ReviewRequest, output: dict[str, Any]
) -> tuple[int | None, str | None, str]:
    """Return the stored level, department, and audit event for a Nurse Review."""
    if review.action == "reassess":
        return None, output.get("department"), "reassess"
    if review.action == "escalate":
        return 1, output.get("department"), "escalate"
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
) -> tuple[
    Literal["pending", "confirmed", "overridden", "escalated"],
    int | None,
    Literal["none", "requested"],
]:
    """Working level, review status, and whether reassessment was requested later."""
    suggested = output.get("triage_level")
    level = int(suggested) if suggested is not None else None
    status: Literal["pending", "confirmed", "overridden", "escalated"] = "pending"
    decision_at = ""
    for review in reviews:
        if review.action == "reassess":
            continue
        decision_at = review.created_at
        if review.triage_level is not None:
            level = review.triage_level
        if review.action == "override":
            status = "overridden"
        elif review.action == "escalate":
            status = "escalated"
        else:
            status = "confirmed"
    reassessment: Literal["none", "requested"] = "none"
    if any(review.action == "reassess" and review.created_at >= decision_at for review in reviews):
        reassessment = "requested"
    return status, level, reassessment


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


def _latest_prediction(session: Any, case_id: str) -> PredictionRecord | None:
    return session.scalar(
        select(PredictionRecord)
        .where(PredictionRecord.case_id == case_id)
        .order_by(PredictionRecord.created_at.desc())
    )


def _latest_review(session: Any, case_id: str) -> NurseReviewRecord | None:
    return session.scalar(
        select(NurseReviewRecord)
        .where(NurseReviewRecord.case_id == case_id)
        .order_by(NurseReviewRecord.created_at.desc())
    )


def _queue_key(item: QueueItem) -> tuple[int, int, str]:
    pin = 0 if item.abstain or (item.triage_level is not None and item.triage_level <= 2) else 1
    level = item.triage_level if item.triage_level is not None else 9
    return (pin, level, item.arrival_time)
