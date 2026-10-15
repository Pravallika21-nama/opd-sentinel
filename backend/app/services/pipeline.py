"""Run one case through validation, Classical ML, and the Safety-Rule Layer.

A model error leaves the case without a model view. Arbitration then abstains
to Nurse Review. No prediction is substituted.
"""

from __future__ import annotations

import time
from typing import Any

from core.arbitration import arbitrate
from core.constants import INTAKE_FIELDS
from core.schemas import TriageDecision
from ml.predict import classical_view


def warm_models() -> None:
    """Load the artefact once at startup so the first request does not pay for it."""
    sample = {
        "age": 40,
        "sex": "female",
        "systolic_bp": 120,
        "diastolic_bp": 80,
        "pulse": 80,
        "temperature_c": 37.0,
        "spo2": 98,
        "complaint": "cough",
    }
    try:
        classical_view(sample)
    except Exception:
        return


def model_intake(raw: dict[str, Any]) -> dict[str, Any]:
    """Only the fields the model and rules read. Notes and identifiers stay out."""
    return {key: raw.get(key) for key in INTAKE_FIELDS}


def run_triage(
    intake: dict[str, Any], *, illustrative: bool = False
) -> tuple[TriageDecision, float]:
    """Return the decision and the measured latency in milliseconds."""
    started = time.perf_counter()
    scoped = model_intake(intake)
    classical_error: str | None = None
    try:
        classical = classical_view(scoped)
    except Exception as exc:
        classical = None
        classical_error = f"Classical ML failed ({type(exc).__name__})."
    decision = arbitrate(scoped, classical, illustrative=illustrative)
    if classical_error:
        decision.model_status = "error"
        if classical_error not in decision.abstain_reasons:
            decision.abstain = True
            decision.abstain_reasons.append(classical_error)
            decision.explanation.append(classical_error)
    latency_ms = (time.perf_counter() - started) * 1000
    return decision, latency_ms
