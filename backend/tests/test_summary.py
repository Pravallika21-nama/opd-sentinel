"""Station card counts stay tied to explicit rules."""

from datetime import date, timedelta, timezone

from app.schemas import QueueItem
from app.services.summary import station_summary


def _item(**overrides: object) -> QueueItem:
    base = {
        "id": "case-1",
        "arrival_time": "2026-10-15T02:00:00+00:00",
        "wait_seconds": 10,
        "triage_level": 4,
        "department": "General Medicine",
        "abstain": False,
        "illustrative": False,
        "complaint_preview": "cough",
        "review_status": "pending",
    }
    base.update(overrides)
    return QueueItem.model_validate(base)


def test_cards_follow_their_rules() -> None:
    items = [
        _item(id="today-urgent", arrival_time="2026-10-15T08:00:00+00:00", triage_level=1),
        _item(
            id="yesterday",
            arrival_time="2026-10-14T08:00:00+00:00",
            triage_level=1,
            review_status="confirmed",
            consultation_status="awaiting_doctor",
        ),
        _item(id="vitals", triage_level=3, data_quality="warning"),
        _item(id="level2", triage_level=2),
        _item(
            id="done",
            review_status="confirmed",
            consultation_status="completed",
            triage_level=1,
        ),
        _item(id="unassessed", triage_level=None, abstain=True),
    ]
    summary = station_summary(items, today=date(2026, 10, 15))
    assert summary["registered_today"] == 5
    assert summary["waiting"] == 5
    assert summary["awaiting_nurse_review"] == 4
    assert summary["awaiting_doctor"] == 1
    assert summary["urgent_alerts"] == 4
    assert summary["vital_warnings"] == 1


def test_today_uses_the_clinic_offset() -> None:
    ist = timezone(timedelta(minutes=330))
    late_utc = _item(id="late", arrival_time="2026-10-14T20:00:00+00:00")
    summary = station_summary([late_utc], today=date(2026, 10, 15), tz=ist)
    assert summary["registered_today"] == 1
