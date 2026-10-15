"""Read-only view of a patient's self check-in. Shared by the portal and the encounter."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import PatientIntakeRecord


def checkin_dict(row: PatientIntakeRecord) -> dict[str, Any]:
    """Every stored answer, labelled by field. Nothing here was measured by staff."""
    return {
        "id": row.id,
        "created_at": row.created_at,
        "status": row.status,
        "status_note": row.status_note,
        "patient_ref": row.patient_ref,
        "full_name": row.full_name,
        "age": row.age,
        "sex": row.sex,
        "preferred_language": row.preferred_language,
        "symptoms": row.symptoms,
        "symptom_duration": row.symptom_duration,
        "severity": row.severity,
        "known_conditions": row.known_conditions,
        "medications": row.medications,
        "allergies": row.allergies,
        "self_vitals": json.loads(row.self_vitals_json or "{}"),
        "red_flags": json.loads(row.red_flags_json or "[]"),
        "reviewed_by": row.reviewed_by,
        "reviewed_at": row.reviewed_at,
        "case_id": row.case_id,
    }


def self_report_for_case(session: Session, case_id: str) -> dict[str, Any] | None:
    """The patient's own check-in behind an encounter, for the nurse and doctor."""
    row = session.scalar(select(PatientIntakeRecord).where(PatientIntakeRecord.case_id == case_id))
    return checkin_dict(row) if row else None
