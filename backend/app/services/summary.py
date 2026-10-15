"""Counting rules for the nurse-station cards.

The four cards answer different questions. Patients today is an arrival count.
The other three count cases that are still waiting for Nurse Review.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from app.schemas import QueueItem


def arrival_utc_date(value: str) -> date | None:
    """Calendar date of a stored arrival timestamp, in UTC."""
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).date()


def station_summary(items: list[QueueItem], *, today: date) -> dict[str, object]:
    """Return the four station counts and the rule that produced each one."""
    patients_today = sum(1 for item in items if arrival_utc_date(item.arrival_time) == today)
    pending = [item for item in items if item.review_status == "pending"]
    urgent = [item for item in pending if item.triage_level is not None and item.triage_level <= 2]
    emergency = [item for item in pending if item.triage_level == 1]
    human = [item for item in pending if item.abstain or item.data_quality == "warning"]
    return {
        "as_of_utc_date": today.isoformat(),
        "patients_today": patients_today,
        "patients_today_rule": (
            "Arrivals whose stored timestamp falls on this UTC calendar date. "
            "Reviewed cases are included. This is not the number waiting now."
        ),
        "urgent_review": len(urgent),
        "urgent_review_rule": ("Still pending Nurse Review, with safety-adjusted level 1 or 2."),
        "emergency_alerts": len(emergency),
        "emergency_alerts_rule": ("Still pending Nurse Review, with safety-adjusted level 1."),
        "human_review_required": len(human),
        "human_review_required_rule": (
            "Still pending Nurse Review, and either unassessable or a vital-sign warning."
        ),
        "waiting_for_review": len(pending),
    }
