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


def triage_and_store(intake: IntakeRequest, *, case_id: str | None = None) -> TriageResponse:
    """Score one intake, store it, and append an audit row."""
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
            session.add(
                CaseRecord(
                    id=stored_id,
                    created_at=created,
                    arrival_time=arrival,
                    raw_json=json.dumps(raw),
                    illustrative=1 if illustrative else 0,
                    complaint_preview=_preview(intake.complaint),
                )
            )
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
    return TriageResponse(case_id=stored_id, latency_ms=round(latency_ms, 2), **payload)


def list_queue() -> list[QueueItem]:
    """Priority order: abstentions and levels 1–2 first, then level, then arrival."""
    with session_scope() as session:
        cases = session.scalars(select(CaseRecord)).all()
        items: list[QueueItem] = []
        for case in cases:
            prediction = _latest_prediction(session, case.id)
            review = _latest_review(session, case.id)
            output = json.loads(prediction.output_json) if prediction else {}
            status: Literal["pending", "confirmed", "overridden"]
            if review is None:
                status = "pending"
            elif review.action == "override":
                status = "overridden"
            else:
                status = "confirmed"
            arrival = datetime.fromisoformat(case.arrival_time)
            if arrival.tzinfo is None:
                arrival = arrival.replace(tzinfo=UTC)
            wait = (datetime.now(UTC) - arrival).total_seconds()
            items.append(
                QueueItem(
                    id=case.id,
                    arrival_time=case.arrival_time,
                    wait_seconds=max(0.0, round(wait, 1)),
                    triage_level=output.get("triage_level"),
                    department=output.get("department"),
                    abstain=bool(output.get("abstain")),
                    illustrative=bool(case.illustrative),
                    complaint_preview=case.complaint_preview,
                    review_status=status,
                    source_label=output.get("source_label"),
                )
            )
    items.sort(key=_queue_key)
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
        level: int | None
        if review.action == "override":
            if review.triage_level is None:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "message": "An override needs a triage level.",
                        "errors": [
                            {"field": "triage_level", "message": "Required when overriding."}
                        ],
                    },
                )
            level = review.triage_level
            department = review.department or output.get("department")
        else:
            suggested = output.get("triage_level")
            level = int(suggested) if suggested is not None else None
            if level is None:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "message": (
                            "There is no suggested level to confirm. Override with a level instead."
                        ),
                        "errors": [
                            {
                                "field": "triage_level",
                                "message": "Required because the suggestion abstained.",
                            }
                        ],
                    },
                )
            department = output.get("department")
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
                event="nurse_review",
                payload_json=json.dumps(
                    {
                        "action": review.action,
                        "triage_level": level,
                        "department": department,
                        "reason": review.reason,
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
    level = item.triage_level if item.triage_level is not None else 0
    return (pin, level, item.arrival_time)
