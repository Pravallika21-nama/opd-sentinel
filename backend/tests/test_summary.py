"""Station card counts stay tied to explicit rules."""

from datetime import date

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


def test_cards_do_not_treat_the_whole_queue_as_today() -> None:
    items = [
        _item(id="today", arrival_time="2026-10-15T18:00:00+00:00", triage_level=1),
        _item(
            id="yesterday",
            arrival_time="2026-10-14T18:00:00+00:00",
            triage_level=1,
            review_status="confirmed",
        ),
        _item(id="uncertain", triage_level=3, data_quality="warning"),
        _item(id="level2", triage_level=2),
    ]
    summary = station_summary(items, today=date(2026, 10, 15))
    assert summary["patients_today"] == 3
    assert summary["urgent_review"] == 2
    assert summary["emergency_alerts"] == 1
    assert summary["human_review_required"] == 1
    assert summary["waiting_for_review"] == 3
