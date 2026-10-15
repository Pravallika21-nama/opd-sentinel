"""API coverage for triage, queue, review, rules, and metrics."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db import reset_engines
from app.settings import get_settings


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("OPD_DATABASE_PATH", str(tmp_path / "api.db"))
    monkeypatch.setenv("OPD_SEED_DEMO", "0")
    get_settings.cache_clear()
    reset_engines()
    from app.main import app

    return TestClient(app)


def test_invalid_type_is_structured_422(client: TestClient) -> None:
    response = client.post("/triage", json={"age": "not-a-number", "complaint": "cough"})
    assert response.status_code == 422
    body = response.json()
    assert body["errors"]
    assert "message" in body


def test_implausible_vitals_are_accepted(client: TestClient) -> None:
    response = client.post(
        "/triage",
        json={
            "age": 50,
            "sex": "male",
            "systolic_bp": 0,
            "diastolic_bp": 80,
            "pulse": 76,
            "temperature_c": 96,
            "spo2": 140,
            "complaint": "halka sardi",
        },
    )
    assert response.status_code == 200
    body = response.json()
    statuses = {item["field"]: item["status"] for item in body["validation_issues"]}
    assert statuses["systolic_bp"] == "implausible"
    assert statuses["temperature_c"] == "conflicting"
    assert statuses["spo2"] == "implausible"
    assert body["opd_number"].startswith("OPD-")
    again = client.get(f"/queue/{body['case_id']}")
    assert again.status_code == 200
    assert again.json()["opd_number"] == body["opd_number"]
    second = client.post(
        "/triage",
        json={
            "age": 50,
            "sex": "male",
            "systolic_bp": 120,
            "diastolic_bp": 80,
            "pulse": 76,
            "temperature_c": 36.8,
            "spo2": 98,
            "complaint": "halka sardi",
        },
    )
    assert second.status_code == 200
    assert second.json()["opd_number"] != body["opd_number"]
    assert second.json()["case_id"] != body["case_id"]
    assert "latency_ms" in body
    assert body["case_id"].startswith("case-")


def test_queue_review_and_audit(client: TestClient) -> None:
    created = client.post(
        "/triage",
        json={
            "age": 70,
            "sex": "female",
            "systolic_bp": 100,
            "diastolic_bp": 60,
            "pulse": 88,
            "temperature_c": 36.6,
            "spo2": 84,
            "complaint": "saans nahi le pa raha",
            "illustrative": True,
        },
    )
    assert created.status_code == 200
    case_id = created.json()["case_id"]
    assert created.json()["triage_level"] == 1
    queued = client.get("/queue")
    assert queued.status_code == 200
    assert any(item["id"] == case_id for item in queued.json())
    review = client.post(
        f"/queue/{case_id}/review",
        json={
            "action": "override",
            "triage_level": 2,
            "department": "Pulmonology",
            "reason": "Nurse agrees urgency is high",
        },
    )
    assert review.status_code == 200
    audit = client.get("/audit", params={"case_id": case_id})
    events = [row["event"] for row in audit.json()]
    assert events == ["triage", "nurse_review"]
    assert audit.json()[1]["payload"]["reason"].startswith("Nurse agrees")


def test_rules_metrics_and_batch(client: TestClient) -> None:
    rules = client.get("/rules")
    assert rules.status_code == 200
    assert len(rules.json()["rules"]) >= 8
    assert rules.json()["clinically_reviewed"] is False
    metrics = client.get("/metrics")
    assert metrics.status_code == 200
    body = metrics.json()
    assert "sections" in body or body.get("status") == "Pending"
    batch = client.post(
        "/triage/batch",
        json={
            "cases": [
                {"age": 30, "complaint": "cough", "spo2": 99},
                {"age": 31, "complaint": "seene mein dard"},
            ]
        },
    )
    assert batch.status_code == 200
    assert len(batch.json()) == 2
    demo = client.get("/demo/cases")
    assert demo.status_code == 200
    assert "Example, not a real clinical outcome" in demo.json()["banner"]


def test_rules_check_does_not_store_and_flags_hypoxia(client: TestClient) -> None:
    before = client.get("/audit")
    checked = client.post(
        "/rules/check",
        json={"spo2": 86, "complaint": "saans nahi le pa raha", "age": 67},
    )
    assert checked.status_code == 200
    body = checked.json()
    assert body["clinically_reviewed"] is False
    assert body["rule_level"] == 1
    assert any(rule["id"] == "spo2_below_90" for rule in body["fired_rules"])
    after = client.get("/audit")
    assert len(after.json()) == len(before.json())


def test_escalate_is_audited_and_reassess_does_not_change_level(client: TestClient) -> None:
    created = client.post(
        "/triage",
        json={"age": 40, "sex": "male", "spo2": 98, "pulse": 76, "complaint": "mild cough"},
    )
    assert created.status_code == 200
    case_id = created.json()["case_id"]
    escalated = client.post(
        f"/queue/{case_id}/review",
        json={"action": "escalate", "reason": "Nurse wants immediate assessment"},
    )
    assert escalated.status_code == 200
    assert escalated.json()["triage_level"] == 1
    reassess = client.post(
        f"/queue/{case_id}/review",
        json={"action": "reassess", "reason": "Need a repeat blood pressure"},
    )
    assert reassess.status_code == 200
    queued = client.get("/queue").json()
    row = next(item for item in queued if item["id"] == case_id)
    assert row["triage_level"] == 1
    assert row["reassessment"] == "requested"
    assert "timer does not change urgency" in row["position_reason"]
    events = [item["event"] for item in client.get("/audit", params={"case_id": case_id}).json()]
    assert events == ["triage", "escalate", "reassess"]
