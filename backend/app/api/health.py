"""Health endpoint."""

from fastapi import APIRouter

from app import __version__
from app.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Report that the API process is up.

    A successful response does not mean a model is loaded or that any clinical
    claim has been measured.
    """
    return HealthResponse(status="ok", service="OPD Sentinel", version=__version__)
