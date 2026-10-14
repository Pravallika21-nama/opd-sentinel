"""HTTP schemas.

The triage response schema arrives in Phase 6. This module currently covers
the health check only.
"""

from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Liveness payload for GET /health.

    This reports that the API process is up. It does not report model quality.
    """

    status: Literal["ok"]
    service: str = Field(examples=["OPD Sentinel"])
    version: str
