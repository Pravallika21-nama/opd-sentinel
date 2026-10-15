"""Sign-in, role enforcement, and the nurse-to-doctor encounter journey."""

from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from app.auth import hash_password, verify_password

_INTAKE = {
    "age": 52,
    "sex": "female",
    "systolic_bp": 128,
    "diastolic_bp": 82,
    "pulse": 84,
    "temperature_c": 37.2,
    "spo2": 97,
    "complaint": "fever and cough for three days",
    "known_conditions": "diabetes",
    "medications": "metformin",
    "patient_ref": "DEMO-PT-0001",
    "patient_name": "Fictional Patient A",
    "nurse_notes": "Speaks Telugu. Came with daughter.",
    "uncertain_information": "Unsure of fever duration",
}


def _register(api: TestClient, nurse: dict[str, str], **overrides: object) -> dict:
    response = api.post("/triage", json={**_INTAKE, **overrides}, headers=nurse)
    assert response.status_code == 200, response.text
    return response.json()


def test_password_hash_round_trip() -> None:
    stored = hash_password("correct horse")
    assert stored.startswith("pbkdf2_sha256$")
    assert "correct horse" not in stored
    assert verify_password("correct horse", stored)
    assert not verify_password("wrong", stored)


def test_unauthenticated_requests_are_rejected(api: TestClient) -> None:
    assert api.get("/health").status_code == 200
    assert api.get("/queue").status_code == 401
    assert api.post("/triage", json=_INTAKE).status_code == 401
    bad = api.post("/auth/login", json={"username": "nurse.demo", "password": "nope"})
    assert bad.status_code == 401
    forged = api.get("/queue", headers={"Authorization": "Bearer not-a-token"})
    assert forged.status_code == 401


def test_logout_revokes_the_token(api: TestClient, nurse: dict[str, str]) -> None:
    assert api.get("/auth/me", headers=nurse).json()["role"] == "nurse"
    assert api.post("/auth/logout", headers=nurse).status_code == 200
    assert api.get("/auth/me", headers=nurse).status_code == 401


def test_roles_are_enforced_on_the_server(
    api: TestClient, nurse: dict[str, str], doctor: dict[str, str], admin: dict[str, str]
) -> None:
    assert api.post("/triage", json=_INTAKE, headers=doctor).status_code == 403
    assert api.post("/triage", json=_INTAKE, headers=admin).status_code == 403
    case = _register(api, nurse)
    review = {"action": "confirm", "reason": "Agree with suggestion"}
    assert (
        api.post(f"/queue/{case['case_id']}/review", json=review, headers=doctor).status_code == 403
    )
    rx = {
        "medication": "Paracetamol",
        "dose": "500",
        "dose_unit": "mg",
        "route": "oral",
        "frequency": "three times a day",
        "duration": "3 days",
    }
    assert (
        api.post(f"/encounters/{case['case_id']}/prescriptions", json=rx, headers=nurse).status_code
        == 403
    )
    assert (
        api.post(f"/encounters/{case['case_id']}/prescriptions", json=rx, headers=admin).status_code
        == 403
    )
    assert api.get("/operations/summary", headers=nurse).status_code == 403
    assert api.get("/operations/summary", headers=doctor).status_code == 403
    assert api.get("/operations/summary", headers=admin).status_code == 200
    assert api.get("/audit", headers=nurse).status_code == 403
    assert api.get("/audit", headers=admin).status_code == 200


def test_send_to_doctor_needs_a_nurse_decision(api: TestClient, nurse: dict[str, str]) -> None:
    case = _register(api, nurse)
    early = api.post(f"/encounters/{case['case_id']}/send-to-doctor", json={}, headers=nurse)
    assert early.status_code == 409
    assert "before sending" in early.json()["detail"]["message"]

    case_id = case["case_id"]
    confirm = {"action": "confirm", "reason": "Agree with suggestion"}
    reassess = {"action": "reassess", "reason": "Recheck blood pressure"}
    assert api.post(f"/queue/{case_id}/review", json=confirm, headers=nurse).status_code == 200
    assert api.post(f"/queue/{case_id}/review", json=reassess, headers=nurse).status_code == 200
    pending = api.post(f"/encounters/{case_id}/send-to-doctor", json={}, headers=nurse)
    assert pending.status_code == 409


def test_full_encounter_journey(
    api: TestClient, nurse: dict[str, str], doctor: dict[str, str], admin: dict[str, str]
) -> None:
    case = _register(api, nurse)
    case_id = case["case_id"]
    opd = case["opd_number"]
    assert opd.startswith("OPD-")

    summary = api.get("/station/summary", headers=nurse).json()
    assert summary["registered_today"] == 1
    assert summary["awaiting_nurse_review"] == 1
    assert summary["waiting"] == 1

    level = case["triage_level"]
    action = (
        {"action": "confirm", "reason": "Agree with suggestion"}
        if level is not None
        else {"action": "override", "triage_level": 3, "reason": "Nurse assessed level 3"}
    )
    assert api.post(f"/queue/{case_id}/review", json=action, headers=nurse).status_code == 200
    sent = api.post(f"/encounters/{case_id}/send-to-doctor", json={"note": "Ready"}, headers=nurse)
    assert sent.status_code == 200
    assert api.get("/station/summary", headers=nurse).json()["awaiting_doctor"] == 1

    doctor_queue = api.get("/doctor/queue", headers=doctor).json()
    row = next(item for item in doctor_queue if item["id"] == case_id)
    assert row["opd_number"] == opd
    assert row["nurse_notes"].startswith("Speaks Telugu")

    early_rx = api.post(
        f"/encounters/{case_id}/prescriptions",
        json={
            "medication": "Paracetamol",
            "dose": "500",
            "dose_unit": "mg",
            "route": "oral",
            "frequency": "three times a day",
            "duration": "3 days",
        },
        headers=doctor,
    )
    assert early_rx.status_code == 409

    started = api.post(f"/encounters/{case_id}/consultation/start", headers=doctor)
    assert started.json()["consultation_status"] == "in_consultation"

    incomplete = api.post(
        f"/encounters/{case_id}/status", json={"status": "completed"}, headers=doctor
    )
    assert incomplete.status_code == 409

    empty = api.put(f"/encounters/{case_id}/consultation", json={}, headers=doctor)
    assert empty.status_code == 422

    note = {
        "examination_findings": "Chest clear. Throat mildly red.",
        "clinical_assessment": "Likely viral upper respiratory infection.",
        "diagnosis": "Acute upper respiratory infection",
        "treatment_plan": "Fluids, antipyretic",
        "follow_up": "Return if fever beyond 5 days",
        "referral": "",
    }
    saved = api.put(f"/encounters/{case_id}/consultation", json=note, headers=doctor)
    assert saved.status_code == 200
    assert saved.json()["doctor_name"].startswith("Demo Doctor")

    invalid_rx = api.post(
        f"/encounters/{case_id}/prescriptions",
        json={
            "medication": "Paracetamol",
            "dose": "abc",
            "dose_unit": "mg",
            "route": "oral",
            "frequency": "",
            "duration": "3 days",
        },
        headers=doctor,
    )
    assert invalid_rx.status_code == 422
    fields = {error["field"] for error in invalid_rx.json()["errors"]}
    assert {"dose", "frequency"} <= fields

    rx = api.post(
        f"/encounters/{case_id}/prescriptions",
        json={
            "medication": "Paracetamol",
            "dose": "500",
            "dose_unit": "mg",
            "route": "oral",
            "frequency": "three times a day",
            "duration": "3 days",
            "instructions": "After food",
        },
        headers=doctor,
    )
    assert rx.status_code == 200
    assert rx.json()["status"] == "active"
    assert rx.json()["prescriber_name"].startswith("Demo Doctor")

    record = api.get(f"/encounters/{case_id}", headers=nurse).json()
    assert record["consultation_status"] == "prescription_recorded"
    assert record["opd_number"] == opd
    assert record["consultation"]["diagnosis"] == "Acute upper respiratory infection"
    assert record["decision"]["triage_level"] == case["triage_level"]
    assert len(record["prescriptions"]) == 1

    cancelled = api.post(
        f"/prescriptions/{rx.json()['id']}/status",
        json={"action": "cancel", "reason": "Entered twice"},
        headers=doctor,
    )
    assert cancelled.json()["status"] == "cancelled"

    done = api.post(
        f"/encounters/{case_id}/status",
        json={"status": "completed", "note": "Discharged"},
        headers=doctor,
    )
    assert done.status_code == 200

    locked = api.post(
        f"/queue/{case_id}/review",
        json={"action": "reassess", "reason": "Too late"},
        headers=nurse,
    )
    assert locked.status_code == 409

    open_ids = {item["id"] for item in api.get("/queue", headers=nurse).json()}
    assert case_id not in open_ids
    all_ids = {
        item["id"]
        for item in api.get("/queue", params={"include_closed": True}, headers=nurse).json()
    }
    assert case_id in all_ids

    ops = api.get("/operations/summary", headers=admin).json()
    assert ops["kpis"]["registered_today"] == 1
    assert ops["kpis"]["completed_today"] == 1
    assert ops["kpis"]["prescriptions_today"] == 0
    assert ops["kpis"]["waiting"] == 0
    completed = next(row for row in ops["status_distribution"] if row["status"] == "completed")
    assert completed["count"] == 1

    events = [
        row["event"] for row in api.get("/audit", params={"case_id": case_id}, headers=admin).json()
    ]
    for expected in (
        "registration",
        "triage",
        "nurse_review",
        "send_to_doctor",
        "consultation_started",
        "consultation_saved",
        "prescription_created",
        "prescription_cancelled",
        "consultation_completed",
    ):
        assert expected in events


def test_repeat_visit_links_previous_encounter(api: TestClient, nurse: dict[str, str]) -> None:
    first = _register(api, nurse)
    second = _register(api, nurse, complaint="follow-up visit, cough better")
    assert first["opd_number"] != second["opd_number"]
    record = api.get(f"/encounters/{second['case_id']}", headers=nurse).json()
    previous = [row["opd_number"] for row in record["previous_encounters"]]
    assert previous == [first["opd_number"]]


def test_concurrent_registrations_get_unique_opd_numbers(
    api: TestClient, nurse: dict[str, str]
) -> None:
    def register(index: int) -> str:
        response = api.post(
            "/triage",
            json={"age": 30 + index, "complaint": "cough", "spo2": 98},
            headers=nurse,
        )
        assert response.status_code == 200, response.text
        return str(response.json()["opd_number"])

    with ThreadPoolExecutor(max_workers=6) as pool:
        numbers = list(pool.map(register, range(18)))
    assert len(set(numbers)) == len(numbers)
