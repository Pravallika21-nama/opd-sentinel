"""One-click demo sign-in, and the live queue position that moves with severity."""

import pytest
from fastapi.testclient import TestClient

from app.settings import get_settings


def _local(api: TestClient) -> TestClient:
    return TestClient(api.app, client=("127.0.0.1", 50000))


def test_quick_login_lists_and_signs_in_demo_accounts_locally(api: TestClient) -> None:
    local = _local(api)
    accounts = local.get("/auth/options").json()["demo_accounts"]
    assert [row["username"] for row in accounts] == [
        "nurse.demo",
        "doctor.demo",
        "admin.demo",
        "patient.demo",
    ]
    response = local.post("/auth/demo-login", json={"username": "doctor.demo"})
    assert response.status_code == 200, response.text
    headers = {"Authorization": f"Bearer {response.json()['token']}"}
    assert local.get("/auth/me", headers=headers).json()["role"] == "doctor"
    admin = local.post("/auth/demo-login", json={"username": "admin.demo"}).json()
    events = local.get("/audit", headers={"Authorization": f"Bearer {admin['token']}"}).json()
    assert any(row["event"] == "demo_quick_login" for row in events)


def test_quick_login_refuses_remote_clients_and_real_accounts(api: TestClient) -> None:
    assert api.post("/auth/demo-login", json={"username": "nurse.demo"}).status_code == 403
    local = _local(api)
    signup = api.post(
        "/auth/register-patient",
        json={"username": "real.person", "display_name": "Fictional", "password": "pass-word-1"},
    )
    assert signup.status_code == 201
    assert local.post("/auth/demo-login", json={"username": "real.person"}).status_code == 403


def test_quick_login_can_be_turned_off(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPD_DEMO_QUICK_LOGIN", "false")
    get_settings.cache_clear()
    local = _local(api)
    assert local.get("/auth/options").json()["demo_accounts"] == []
    assert local.post("/auth/demo-login", json={"username": "nurse.demo"}).status_code == 403


_MILD = {"systolic_bp": 120, "diastolic_bp": 80, "pulse": 76, "temperature_c": 37.0, "spo2": 99}


def _register(api: TestClient, nurse: dict[str, str], complaint: str, **vitals: float) -> str:
    body = {"age": 45, "sex": "male", "complaint": complaint, **vitals}
    response = api.post("/triage", json=body, headers=nurse)
    assert response.status_code == 200, response.text
    return str(response.json()["case_id"])


def test_urgent_patient_moves_ahead_of_arrival_order(
    api: TestClient, nurse: dict[str, str]
) -> None:
    first = _register(api, nurse, "mild cough for two days", **_MILD)
    _register(api, nurse, "small cut on finger", **_MILD)
    before = {row["id"]: row["opd_number"] for row in api.get("/queue", headers=nurse).json()}
    urgent = _register(
        api,
        nurse,
        "severe chest pain spreading to left arm, sweating",
        systolic_bp=150,
        diastolic_bp=95,
        pulse=118,
        temperature_c=37.0,
        spo2=93,
    )
    queue = {row["id"]: row for row in api.get("/queue", headers=nurse).json()}
    assert queue[urgent]["arrival_position"] == 3
    assert queue[urgent]["rank"] < queue[urgent]["arrival_position"]
    assert queue[first]["arrival_position"] == 1
    for case_id, opd_number in before.items():
        assert queue[case_id]["opd_number"] == opd_number


def test_patient_sees_live_place_in_line(
    api: TestClient, nurse: dict[str, str], patient: dict[str, str]
) -> None:
    _register(api, nurse, "mild cough for two days", **_MILD)
    checkin = api.post(
        "/patient/checkins",
        json={"full_name": "Fictional C", "symptoms": "rash on arm", "consent": True},
        headers=patient,
    ).json()
    registered = api.post(
        f"/checkins/{checkin['id']}/register",
        json={"identity_confirmed": True, "intake": {"age": 30, "complaint": "rash", **_MILD}},
        headers=nurse,
    )
    assert registered.status_code == 200, registered.text
    place = api.get(f"/patient/checkins/{checkin['id']}", headers=patient).json()["encounter"]
    assert place["queue_place"]["waiting"] == 2
    assert place["queue_place"]["position"] in {1, 2}
    _register(
        api,
        nurse,
        "severe chest pain spreading to left arm, sweating",
        systolic_bp=150,
        diastolic_bp=95,
        pulse=118,
        temperature_c=37.0,
        spo2=93,
    )
    moved = api.get(f"/patient/checkins/{checkin['id']}", headers=patient).json()["encounter"]
    assert moved["queue_place"]["waiting"] == 3
    assert moved["queue_place"]["position"] == place["queue_place"]["position"] + 1
