"""Shared API fixtures. Each test gets its own database and fictional accounts."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db import reset_engines
from app.settings import get_settings

DEMO_PASSWORD = "test-only-password"


@pytest.fixture()
def api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("OPD_DATABASE_PATH", str(tmp_path / "api.db"))
    monkeypatch.setenv("OPD_SEED_DEMO", "0")
    monkeypatch.setenv("OPD_SEED_USERS", "1")
    monkeypatch.setenv("OPD_DEMO_PASSWORD", DEMO_PASSWORD)
    get_settings.cache_clear()
    reset_engines()
    from app.main import app

    with TestClient(app) as client:
        yield client
    get_settings.cache_clear()
    reset_engines()


def auth_headers(client: TestClient, username: str) -> dict[str, str]:
    response = client.post("/auth/login", json={"username": username, "password": DEMO_PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture()
def nurse(api: TestClient) -> dict[str, str]:
    return auth_headers(api, "nurse.demo")


@pytest.fixture()
def doctor(api: TestClient) -> dict[str, str]:
    return auth_headers(api, "doctor.demo")


@pytest.fixture()
def admin(api: TestClient) -> dict[str, str]:
    return auth_headers(api, "admin.demo")


@pytest.fixture()
def patient(api: TestClient) -> dict[str, str]:
    return auth_headers(api, "patient.demo")
