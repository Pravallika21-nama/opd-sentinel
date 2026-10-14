"""OPD Sentinel FastAPI application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.health import router as health_router
from app.settings import get_settings


def create_app() -> FastAPI:
    """Build the API. Later phases register triage, queue, and audit routes."""
    settings = get_settings()
    app = FastAPI(
        title="OPD Sentinel",
        version=__version__,
        summary="Decision-support triage for an overloaded outpatient department.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router)
    return app


app = create_app()
