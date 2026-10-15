"""API coverage for triage, queue, review, rules, and metrics."""

from fastapi.testclient import TestClient


def test_invalid_type_is_structured_422(api: TestClient, nurse: dict[str, str]) -> None:
    response = api.post(
        "/triage", json={"age": "not-a-number", "complaint": "cough"}, headers=nurse
    )
    assert response.status_code == 422
    body = response.json()
    assert body["errors"]
    assert "message" in body


def test_implausible_vitals_are_accepted(api: TestClient, nurse: dict[str, str]) -> None:
    response = api.post(
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
        headers=nurse,
    )
    assert response.status_code == 200
    body = response.json()
    statuses = {item["field"]: item["status"] for item in body["validation_issues"]}
    assert statuses["systolic_bp"] == "implausible"
    assert statuses["temperature_c"] == "conflicting"
    assert statuses["spo2"] == "implausible"
    assert body["opd_number"].startswith("OPD-")
    again = api.get(f"/queue/{body['case_id']}", headers=nurse)
    assert again.status_code == 200
    assert again.json()["opd_number"] == body["opd_number"]
    assert again.json()["input"]["systolic_bp"] == 0
    second = api.post(
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
        headers=nurse,
    )
    assert second.status_code == 200
    assert second.json()["opd_number"] != body["opd_number"]
    assert second.json()["case_id"] != body["case_id"]
    assert "latency_ms" in body
    assert body["case_id"].startswith("case-")
    assert body["assessed_at"]


def test_queue_review_and_audit(api: TestClient, nurse: dict[str, str]) -> None:
    created = api.post(
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
        headers=nurse,
    )
    assert created.status_code == 200
    case_id = created.json()["case_id"]
    assert created.json()["triage_level"] == 1
    queued = api.get("/queue", headers=nurse)
    assert queued.status_code == 200
    assert any(item["id"] == case_id for item in queued.json())
    review = api.post(
        f"/queue/{case_id}/review",
        json={
            "action": "override",
            "triage_level": 2,
            "department": "Pulmonology",
            "reason": "Nurse agrees urgency is high",
        },
        headers=nurse,
    )
    assert review.status_code == 200
    audit = api.get("/audit", params={"case_id": case_id}, headers=nurse)
    events = [row["event"] for row in audit.json()]
    assert events == ["registration", "triage", "nurse_review"]
    assert audit.json()[2]["payload"]["reason"].startswith("Nurse agrees")
    assert audit.json()[2]["actor"] == "nurse.demo"
    row = next(item for item in api.get("/queue", headers=nurse).json() if item["id"] == case_id)
    assert row["triage_level"] == 2
    assert row["department"] == "Pulmonology"
    assert row["suggested_level"] == 1


def test_rules_metrics_and_batch(api: TestClient, nurse: dict[str, str]) -> None:
    rules = api.get("/rules", headers=nurse)
    assert rules.status_code == 200
    assert len(rules.json()["rules"]) >= 8
    assert rules.json()["clinically_reviewed"] is False
    metrics = api.get("/metrics", headers=nurse)
    assert metrics.status_code == 200
    body = metrics.json()
    assert "sections" in body or body.get("status") == "Pending"
    assert "quantum" not in body.get("sections", {})
    batch = api.post(
        "/triage/batch",
        json={
            "cases": [
                {"age": 30, "complaint": "cough", "spo2": 99},
                {"age": 31, "complaint": "seene mein dard"},
            ]
        },
        headers=nurse,
    )
    assert batch.status_code == 200
    assert len(batch.json()) == 2
    demo = api.get("/demo/cases", headers=nurse)
    assert demo.status_code == 200
    assert "Example, not a real clinical outcome" in demo.json()["banner"]


def test_rules_check_does_not_store_and_flags_hypoxia(
    api: TestClient, nurse: dict[str, str], admin: dict[str, str]
) -> None:
    before = api.get("/audit", headers=admin)
    checked = api.post(
        "/rules/check",
        json={"spo2": 86, "complaint": "saans nahi le pa raha", "age": 67},
        headers=nurse,
    )
    assert checked.status_code == 200
    body = checked.json()
    assert body["clinically_reviewed"] is False
    assert body["rule_level"] == 1
    assert any(rule["id"] == "spo2_below_90" for rule in body["fired_rules"])
    after = api.get("/audit", headers=admin)
    assert len(after.json()) == len(before.json())


def test_escalate_is_audited_and_reassess_does_not_change_level(
    api: TestClient, nurse: dict[str, str]
) -> None:
    created = api.post(
        "/triage",
        json={"age": 40, "sex": "male", "spo2": 98, "pulse": 76, "complaint": "mild cough"},
        headers=nurse,
    )
    assert created.status_code == 200
    case_id = created.json()["case_id"]
    escalated = api.post(
        f"/queue/{case_id}/review",
        json={"action": "escalate", "reason": "Nurse wants immediate assessment"},
        headers=nurse,
    )
    assert escalated.status_code == 200
    assert escalated.json()["triage_level"] == 1
    assert escalated.json()["sent_to_doctor"] is True
    reassess = api.post(
        f"/queue/{case_id}/review",
        json={"action": "reassess", "reason": "Need a repeat blood pressure"},
        headers=nurse,
    )
    assert reassess.status_code == 200
    queued = api.get("/queue", headers=nurse).json()
    row = next(item for item in queued if item["id"] == case_id)
    assert row["triage_level"] == 1
    assert row["reassessment"] == "requested"
    assert row["consultation_status"] == "awaiting_doctor"
    assert "timer does not change urgency" in row["position_reason"]
    events = [
        item["event"]
        for item in api.get("/audit", params={"case_id": case_id}, headers=nurse).json()
    ]
    assert events == ["registration", "triage", "escalate", "send_to_doctor", "reassess"]


def test_system_has_no_quantum_fields(api: TestClient, admin: dict[str, str]) -> None:
    body = api.get("/system", headers=admin).json()
    assert not any("quantum" in key for key in body)
    assert "classical_available" in body
