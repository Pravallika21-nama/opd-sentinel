"""OPD Sentinel FastAPI application."""

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api.health import router as health_router
from app.api.routes import router as api_router
from app.db import init_db
from app.settings import get_settings


@asynccontextmanager
async def lifespan(_app: FastAPI) -> Any:
    """Create the audit database and optionally seed illustrative cases."""
    init_db()
    from app.services.pipeline import warm_models

    warm_models()
    if get_settings().seed_demo:
        from app.services.store import seed_demo_cases

        seed_demo_cases()
    yield


def create_app() -> FastAPI:
    """Build the API with triage, queue, audit, rules, and metrics routes."""
    settings = get_settings()
    app = FastAPI(
        title="OPD Sentinel",
        version=__version__,
        summary="Decision-support triage for an overloaded outpatient department.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(RequestValidationError)
    async def invalid_body(_request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = []
        for item in exc.errors():
            loc = [str(part) for part in item.get("loc", []) if part != "body"]
            errors.append({"field": ".".join(loc), "message": item.get("msg", "Invalid value")})
        return JSONResponse(
            status_code=422,
            content={
                "message": "Intake could not be read. Check the field types.",
                "errors": errors,
            },
        )

    app.include_router(health_router)
    app.include_router(api_router)
    return app


app = create_app()
