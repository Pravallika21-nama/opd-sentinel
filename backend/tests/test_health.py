"""Health endpoint tests."""

from fastapi.testclient import TestClient

from app import __version__
from app.main import app

client = TestClient(app)


def test_health_reports_process_up() -> None:
    """GET /health returns the service identity and the installed version."""
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "status": "ok",
        "service": "OPD Sentinel",
        "version": __version__,
    }


def test_health_is_listed_in_the_openapi_schema() -> None:
    """The route stays part of the published API surface."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/health" in paths
    assert "get" in paths["/health"]
