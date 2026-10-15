"""Patient self check-in, nurse verification, and patient data isolation."""

from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

_CHECKIN = {
    "full_name": "Fictional Patient B",
    "age": 41,
    "sex": "female",
    "preferred_language": "te",
    "symptoms": "fever and body ache for two days",
    "symptom_duration": "2 days",
    "severity": 5,
    "known_conditions": "asthma",
    "medications": "salbutamol inhaler",
    "allergies": "penicillin",
    "self_temperature_c": 38.4,
    "consent": True,
}

_MEASURED = {
    "age": 41,
    "sex": "female",
    "systolic_bp": 122,
    "diastolic_bp": 78,
    "pulse": 96,
    "temperature_c": 38.2,
    "spo2": 97,
    "complaint": "fever and body ache for two days",
    "known_conditions": "asthma",
    "medications": "salbutamol inhaler",
    "nurse_notes": "Identity checked against Aadhaar card (fictional).",
}


def _signup(api: TestClient, username: str) -> dict[str, str]:
    response = api.post(
        "/auth/register-patient",
        json={
            "username": username,
            "display_name": "Fictional Patient",
            "password": "patient-pass-1",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["user"]["role"] == "patient"
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_signup_validates_and_rejects_duplicates(api: TestClient) -> None:
    assert api.get("/auth/options").json() == {"patient_signup": True, "demo_accounts": []}
    _signup(api, "ravi.k")
    taken = api.post(
        "/auth/register-patient",
        json={"username": "ravi.k", "display_name": "Someone", "password": "another-pass"},
    )
    assert taken.status_code == 409
    bad = api.post(
        "/auth/register-patient",
        json={"username": "Bad Name!", "display_name": "Someone", "password": "another-pass"},
    )
    assert bad.status_code == 422
    short = api.post(
        "/auth/register-patient",
        json={"username": "short.pw", "display_name": "Someone", "password": "123"},
    )
    assert short.status_code == 422


def test_patients_cannot_reach_staff_routes(api: TestClient, patient: dict[str, str]) -> None:
    for path in ("/queue", "/doctor/queue", "/station/summary", "/checkins", "/insights/datasets"):
        assert api.get(path, headers=patient).status_code == 403, path
    assert api.post("/triage", json=_MEASURED, headers=patient).status_code == 403
    assert api.get("/audit", headers=patient).status_code == 403


def test_staff_cannot_use_patient_routes(api: TestClient, nurse: dict[str, str]) -> None:
    assert api.get("/patient/checkins", headers=nurse).status_code == 403
    assert api.post("/patient/checkins", json=_CHECKIN, headers=nurse).status_code == 403


def test_checkin_requires_consent_and_plausible_readings(
    api: TestClient, patient: dict[str, str]
) -> None:
    no_consent = api.post("/patient/checkins", json={**_CHECKIN, "consent": False}, headers=patient)
    assert no_consent.status_code == 422
    typo = api.post(
        "/patient/checkins", json={**_CHECKIN, "self_temperature_c": 384}, headers=patient
    )
    assert typo.status_code == 422
    assert any(error["field"] == "self_temperature_c" for error in typo.json()["errors"])


def test_red_flag_words_are_returned_for_safety_advice(
    api: TestClient, patient: dict[str, str]
) -> None:
    response = api.post(
        "/patient/checkins",
        json={**_CHECKIN, "symptoms": "chest pain and short of breath since morning"},
        headers=patient,
    )
    assert response.status_code == 201
    flags = {flag["id"] for flag in response.json()["red_flags"]}
    assert {"chest_pain", "breathlessness"} <= flags
    assert "triage_level" not in response.json()


def test_patients_only_see_their_own_checkins(api: TestClient, patient: dict[str, str]) -> None:
    mine = api.post("/patient/checkins", json=_CHECKIN, headers=patient).json()
    other = _signup(api, "other.patient")
    assert api.get("/patient/checkins", headers=other).json() == []
    assert api.get(f"/patient/checkins/{mine['id']}", headers=other).status_code == 404
    assert api.post(f"/patient/checkins/{mine['id']}/withdraw", headers=other).status_code == 404
    listed = api.get("/patient/checkins", headers=patient).json()
    assert [row["id"] for row in listed] == [mine["id"]]
    assert "reviewed_by" not in listed[0]


def test_open_checkins_are_limited(api: TestClient, patient: dict[str, str]) -> None:
    assert api.post("/patient/checkins", json=_CHECKIN, headers=patient).status_code == 201
    assert api.post("/patient/checkins", json=_CHECKIN, headers=patient).status_code == 201
    third = api.post("/patient/checkins", json=_CHECKIN, headers=patient)
    assert third.status_code == 409


def test_withdraw_only_while_waiting(api: TestClient, patient: dict[str, str]) -> None:
    created = api.post("/patient/checkins", json=_CHECKIN, headers=patient).json()
    done = api.post(f"/patient/checkins/{created['id']}/withdraw", headers=patient)
    assert done.json()["status"] == "withdrawn"
    again = api.post(f"/patient/checkins/{created['id']}/withdraw", headers=patient)
    assert again.status_code == 409


def test_nurse_must_confirm_identity(
    api: TestClient, patient: dict[str, str], nurse: dict[str, str]
) -> None:
    created = api.post("/patient/checkins", json=_CHECKIN, headers=patient).json()
    refused = api.post(
        f"/checkins/{created['id']}/register",
        json={"intake": _MEASURED, "identity_confirmed": False},
        headers=nurse,
    )
    assert refused.status_code == 422


def test_doctor_and_admin_cannot_register_checkins(
    api: TestClient, patient: dict[str, str], doctor: dict[str, str], admin: dict[str, str]
) -> None:
    created = api.post("/patient/checkins", json=_CHECKIN, headers=patient).json()
    body = {"intake": _MEASURED, "identity_confirmed": True}
    for headers in (doctor, admin):
        response = api.post(f"/checkins/{created['id']}/register", json=body, headers=headers)
        assert response.status_code == 403
    assert api.get("/checkins", headers=doctor).status_code == 200


def test_return_shows_reason_to_patient(
    api: TestClient, patient: dict[str, str], nurse: dict[str, str]
) -> None:
    created = api.post("/patient/checkins", json=_CHECKIN, headers=patient).json()
    returned = api.post(
        f"/checkins/{created['id']}/return",
        json={"reason": "Please come to the front desk with your old reports."},
        headers=nurse,
    )
    assert returned.json()["status"] == "returned"
    seen = api.get(f"/patient/checkins/{created['id']}", headers=patient).json()
    assert seen["status_note"].startswith("Please come")


def test_checkin_to_doctor_to_visit_summary(
    api: TestClient, patient: dict[str, str], nurse: dict[str, str], doctor: dict[str, str]
) -> None:
    created = api.post("/patient/checkins", json=_CHECKIN, headers=patient).json()
    desk = api.get("/checkins", params={"status": "submitted"}, headers=nurse).json()
    assert [row["id"] for row in desk] == [created["id"]]

    registered = api.post(
        f"/checkins/{created['id']}/register",
        json={"intake": _MEASURED, "identity_confirmed": True},
        headers=nurse,
    )
    assert registered.status_code == 200, registered.text
    case_id = registered.json()["triage"]["case_id"]
    opd = registered.json()["triage"]["opd_number"]
    assert registered.json()["checkin"]["status"] == "registered"

    record = api.get(f"/encounters/{case_id}", headers=nurse).json()
    assert record["self_report"]["id"] == created["id"]
    assert record["self_report"]["allergies"] == "penicillin"
    assert record["input"]["temperature_c"] == 38.2
    assert record["patient_ref"] == created["patient_ref"]
    queue_row = next(row for row in api.get("/queue", headers=nurse).json() if row["id"] == case_id)
    assert queue_row["via_portal"] is True

    twice = api.post(
        f"/checkins/{created['id']}/register",
        json={"intake": _MEASURED, "identity_confirmed": True},
        headers=nurse,
    )
    assert twice.status_code == 409

    review = {"action": "override", "triage_level": 3, "reason": "Nurse assessed level 3"}
    assert api.post(f"/queue/{case_id}/review", json=review, headers=nurse).status_code == 200
    assert (
        api.post(f"/encounters/{case_id}/send-to-doctor", json={}, headers=nurse).status_code == 200
    )
    progress = api.get(f"/patient/checkins/{created['id']}", headers=patient).json()
    assert progress["encounter"]["opd_number"] == opd
    assert progress["encounter"]["consultation_status"] == "awaiting_doctor"
    assert progress["encounter"]["visit_summary"] is None
    assert "decision" not in progress["encounter"]

    api.post(f"/encounters/{case_id}/consultation/start", headers=doctor)
    note = {
        "clinical_assessment": "Viral fever likely.",
        "diagnosis": "Viral fever",
        "treatment_plan": "Rest and fluids",
        "follow_up": "Review in 3 days if fever persists",
    }
    assert (
        api.put(f"/encounters/{case_id}/consultation", json=note, headers=doctor).status_code == 200
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
        api.post(f"/encounters/{case_id}/prescriptions", json=rx, headers=doctor).status_code == 200
    )
    done = api.post(f"/encounters/{case_id}/status", json={"status": "completed"}, headers=doctor)
    assert done.status_code == 200

    final = api.get(f"/patient/checkins/{created['id']}", headers=patient).json()
    summary = final["encounter"]["visit_summary"]
    assert summary["diagnosis"] == "Viral fever"
    assert summary["prescriptions"][0]["medication"] == "Paracetamol"
    statuses = [step["status"] for step in final["encounter"]["timeline"]]
    assert statuses[0] == "registered" and statuses[-1] == "completed"

    events = {
        row["event"]
        for row in api.get("/audit", headers=doctor, params={"case_id": created["id"]}).json()
    }
    assert {"patient_checkin", "checkin_registered"} <= events


def test_concurrent_registration_creates_one_encounter(
    api: TestClient, patient: dict[str, str], nurse: dict[str, str]
) -> None:
    created = api.post("/patient/checkins", json=_CHECKIN, headers=patient).json()
    body = {"intake": _MEASURED, "identity_confirmed": True}

    def attempt(_index: int) -> int:
        return api.post(f"/checkins/{created['id']}/register", json=body, headers=nurse).status_code

    with ThreadPoolExecutor(max_workers=4) as pool:
        codes = list(pool.map(attempt, range(4)))
    assert codes.count(200) == 1
    assert codes.count(409) == 3
    encounters = [row for row in api.get("/queue", headers=nurse).json() if row["via_portal"]]
    assert len(encounters) == 1
