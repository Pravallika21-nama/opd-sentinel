"""OPD Operations analytics. Every number is counted from stored rows.

Waiting time is elapsed time: arrival to consultation start, or arrival to now
for encounters not yet seen. It is not a prediction.
"""

from __future__ import annotations

from collections import Counter
from datetime import UTC, date, datetime, timedelta, timezone
from statistics import median
from typing import Any

from sqlalchemy import func, select

from app.db import PrescriptionRecord, session_scope
from app.schemas import QueueItem
from app.services.summary import WAITING, arrival_local_date, awaiting_nurse, is_urgent

_STATUSES = (
    "registered",
    "awaiting_doctor",
    "in_consultation",
    "prescription_recorded",
    "referred",
    "completed",
)


def _minutes(values: list[float]) -> dict[str, float | int | None]:
    if not values:
        return {"n": 0, "median_min": None, "p90_min": None, "max_min": None}
    ordered = sorted(values)
    p90_index = max(0, int(round(0.9 * (len(ordered) - 1))))
    return {
        "n": len(ordered),
        "median_min": round(median(ordered) / 60, 1),
        "p90_min": round(ordered[p90_index] / 60, 1),
        "max_min": round(ordered[-1] / 60, 1),
    }


def operations_summary(
    items: list[QueueItem], *, today: date, tz: timezone = UTC, days: int = 14
) -> dict[str, Any]:
    """KPIs, distributions, and a daily trend from the encounter list."""
    today_items = [item for item in items if arrival_local_date(item.arrival_time, tz) == today]
    waiting = [item for item in items if item.consultation_status in WAITING]
    seen_today = [item for item in today_items if item.consultation_status not in WAITING]
    with session_scope() as session:
        prescriptions_total = int(
            session.scalar(
                select(func.count())
                .select_from(PrescriptionRecord)
                .where(PrescriptionRecord.status == "active")
            )
            or 0
        )
        prescription_times = session.scalars(
            select(PrescriptionRecord.created_at).where(PrescriptionRecord.status == "active")
        ).all()
    prescriptions_today = sum(
        1 for value in prescription_times if arrival_local_date(value, tz) == today
    )

    department_rows: dict[str, dict[str, int]] = {}
    for item in items:
        if item.consultation_status not in {"referred", "completed"} or (
            arrival_local_date(item.arrival_time, tz) == today
        ):
            name = item.department or "Not assigned"
            row = department_rows.setdefault(
                name, {"waiting": 0, "in_consultation": 0, "closed_today": 0, "urgent_waiting": 0}
            )
            if item.consultation_status in WAITING:
                row["waiting"] += 1
                if is_urgent(item):
                    row["urgent_waiting"] += 1
            elif item.consultation_status in {"in_consultation", "prescription_recorded"}:
                row["in_consultation"] += 1
            else:
                row["closed_today"] += 1
    departments = [
        {"department": name, **counts}
        for name, counts in sorted(
            department_rows.items(), key=lambda pair: (-sum(pair[1].values()), pair[0])
        )
    ]

    status_counts: Counter[str] = Counter(str(item.consultation_status) for item in items)
    review_counts: Counter[str] = Counter(str(item.review_status) for item in waiting)
    level_counts = Counter(
        "unassessed" if item.triage_level is None else str(item.triage_level) for item in waiting
    )

    start = today - timedelta(days=days - 1)
    per_day = Counter(arrival_local_date(item.arrival_time, tz) for item in items)
    trend = [
        {
            "date": (start + timedelta(days=offset)).isoformat(),
            "registrations": per_day.get(start + timedelta(days=offset), 0),
        }
        for offset in range(days)
    ]

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "as_of_date": today.isoformat(),
        "kpis": {
            "registered_today": len(today_items),
            "waiting": len(waiting),
            "awaiting_nurse_review": sum(1 for item in waiting if awaiting_nurse(item)),
            "awaiting_doctor": sum(
                1 for item in waiting if item.consultation_status == "awaiting_doctor"
            ),
            "urgent_waiting": sum(1 for item in waiting if is_urgent(item)),
            "in_consultation": sum(
                1
                for item in items
                if item.consultation_status in {"in_consultation", "prescription_recorded"}
            ),
            "completed_today": sum(
                1 for item in today_items if item.consultation_status == "completed"
            ),
            "referred_today": sum(
                1 for item in today_items if item.consultation_status == "referred"
            ),
            "prescriptions_today": prescriptions_today,
            "prescriptions_total": prescriptions_total,
        },
        "kpi_rules": {
            "registered_today": "Arrivals on today's clinic date, any status.",
            "waiting": "Registered or awaiting the doctor, any date.",
            "completed_today": "Arrived today and consultation completed.",
            "prescriptions_today": "Active prescription lines created today.",
            "urgent_waiting": "Waiting with working level 1 or 2, or unassessable.",
        },
        "waiting_time": {
            "currently_waiting": _minutes([item.wait_seconds for item in waiting]),
            "seen_today": _minutes([item.wait_seconds for item in seen_today]),
            "definition": (
                "Elapsed minutes from arrival to consultation start, or to now if not yet seen. "
                "Not a predicted waiting time."
            ),
        },
        "departments": departments,
        "status_distribution": [
            {"status": status, "count": int(status_counts.get(status, 0))} for status in _STATUSES
        ],
        "nurse_review_distribution": [
            {"status": status, "count": int(review_counts.get(status, 0))}
            for status in ("pending", "confirmed", "overridden", "escalated")
        ],
        "waiting_by_level": [
            {"level": level, "count": int(level_counts.get(level, 0))}
            for level in ("1", "2", "3", "4", "5", "unassessed")
        ],
        "daily_trend": trend,
        "total_encounters": len(items),
    }
