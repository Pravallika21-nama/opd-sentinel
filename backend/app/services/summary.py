"""Counting rules for the nurse-station cards.

Every card is computed from the same encounter list. The rule text is returned
with each value so the dashboard can show exactly what was counted.

- Registered today: arrivals on the clinic's calendar date, any status.
- Waiting: not yet with a doctor (registered or awaiting doctor).
- Awaiting Nurse Review: still with the nurse and no triage decision yet,
  or a reassessment was requested after the last decision.
- Awaiting Doctor: sent to the doctor and not yet started.
- Urgent alerts and vital-sign warnings are subsets of Waiting. They overlap
  with the other cards by design and are labelled as alerts, not stages.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, timezone

from app.schemas import QueueItem

WAITING = frozenset({"registered", "awaiting_doctor"})


def clinic_timezone(offset_minutes: int) -> timezone:
    """Fixed-offset timezone for the clinic's calendar day."""
    return timezone(timedelta(minutes=offset_minutes))


def arrival_local_date(value: str, tz: timezone = UTC) -> date | None:
    """Calendar date of a stored arrival timestamp in the clinic's timezone."""
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(tz).date()


def arrival_utc_date(value: str) -> date | None:
    """Calendar date of a stored arrival timestamp, in UTC."""
    return arrival_local_date(value, UTC)


def is_urgent(item: QueueItem) -> bool:
    """Working level 1 or 2, or the system could not assess the case."""
    return item.abstain or (item.triage_level is not None and item.triage_level <= 2)


def awaiting_nurse(item: QueueItem) -> bool:
    return item.consultation_status == "registered" and (
        item.review_status == "pending" or item.reassessment == "requested"
    )


def station_summary(
    items: list[QueueItem], *, today: date, tz: timezone = UTC
) -> dict[str, object]:
    """Return the six station counts and the rule that produced each one."""
    registered_today = [
        item for item in items if arrival_local_date(item.arrival_time, tz) == today
    ]
    waiting = [item for item in items if item.consultation_status in WAITING]
    nurse = [item for item in waiting if awaiting_nurse(item)]
    doctor = [item for item in waiting if item.consultation_status == "awaiting_doctor"]
    urgent = [item for item in waiting if is_urgent(item)]
    vitals = [item for item in waiting if item.data_quality == "warning"]
    return {
        "as_of_date": today.isoformat(),
        "utc_offset_minutes": int((tz.utcoffset(None) or timedelta()).total_seconds() // 60),
        "registered_today": len(registered_today),
        "registered_today_rule": (
            "Encounters whose arrival time falls on today's clinic date, in any status."
        ),
        "waiting": len(waiting),
        "waiting_rule": "Registered or awaiting the doctor. Not yet in consultation.",
        "awaiting_nurse_review": len(nurse),
        "awaiting_nurse_review_rule": (
            "With the nurse, and no triage decision yet or reassessment requested."
        ),
        "urgent_alerts": len(urgent),
        "urgent_alerts_rule": (
            "Waiting, with working level 1 or 2, or the system could not assess the case."
        ),
        "awaiting_doctor": len(doctor),
        "awaiting_doctor_rule": "Sent to the doctor queue and not yet started.",
        "vital_warnings": len(vitals),
        "vital_warnings_rule": (
            "Waiting, with at least one missing, implausible, or conflicting vital sign."
        ),
    }
