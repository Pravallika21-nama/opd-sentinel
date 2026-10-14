"""Triage, queue, rules, and metrics routes."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.schemas import BatchIntakeRequest, IntakeRequest, QueueItem, ReviewRequest, TriageResponse
from app.services.store import get_case, list_audit, list_queue, review_case, triage_and_store
from core.config_loader import (
    load_demo_config,
    load_red_flag_config,
    load_safety_config,
    load_settings,
    load_validation_config,
)
from core.paths import repo_root

router = APIRouter()
_BATCH_LIMIT = 30


@router.post("/triage", response_model=TriageResponse)
def triage(intake: IntakeRequest) -> TriageResponse:
    """Score one intake. Implausible vitals are flagged inside the decision, not rejected."""
    return triage_and_store(intake)


@router.post("/triage/batch", response_model=list[TriageResponse])
def triage_batch(body: BatchIntakeRequest) -> list[TriageResponse] | JSONResponse:
    """Score a short list of intakes."""
    if len(body.cases) > _BATCH_LIMIT:
        return JSONResponse(
            status_code=422,
            content={
                "message": f"Batch limit is {_BATCH_LIMIT} cases.",
                "errors": [{"field": "cases", "message": f"Send at most {_BATCH_LIMIT} cases."}],
            },
        )
    return [triage_and_store(case) for case in body.cases]


@router.get("/queue", response_model=list[QueueItem])
def queue() -> list[QueueItem]:
    """Waiting cases, emergencies and abstentions first."""
    return list_queue()


@router.get("/queue/{case_id}")
def queue_case(case_id: str) -> dict[str, Any]:
    """One stored case, its latest decision, and Nurse Review rows."""
    return get_case(case_id)


@router.post("/queue/{case_id}/review")
def queue_review(case_id: str, review: ReviewRequest) -> dict[str, Any]:
    """Append a Nurse Review. The prediction row is not edited."""
    return review_case(case_id, review)


@router.get("/audit")
def audit(case_id: str | None = Query(default=None)) -> list[dict[str, Any]]:
    """Append-only audit log, oldest first."""
    return list_audit(case_id)


@router.get("/rules")
def rules() -> dict[str, Any]:
    """Safety-Rule Layer and red-flag lexicon, for the rules page."""
    safety = load_safety_config()
    flags = load_red_flag_config()
    visible_rules = []
    for rule in safety["rules"]:
        visible = {key: value for key, value in rule.items() if key != "example"}
        visible_rules.append(visible)
    return {
        "clinically_reviewed": False,
        "note": "Thresholds are placeholders until a clinician reviews them.",
        "rules": visible_rules,
        "red_flags": flags["flags"],
        "languages": (
            "English, Hindi (roman and Devanagari), Telugu (roman and script), "
            "and a small Tamil set."
        ),
    }


@router.get("/validation-ranges")
def validation_ranges() -> dict[str, Any]:
    """Placeholder plausibility ranges for live form hints."""
    config = load_validation_config()
    return {
        "clinically_reviewed": config.get("clinically_reviewed", False),
        "fields": config["fields"],
        "temperature_unit": config["temperature_unit"],
    }


@router.get("/demo/cases")
def demo_cases() -> dict[str, Any]:
    """Illustrative intakes. Not clinical outcomes."""
    config = load_demo_config()
    return {"banner": config["banner"], "cases": config["cases"]}


@router.get("/metrics")
def metrics() -> dict[str, Any]:
    """Serve reports/results.json. Missing file or cells stay Pending."""
    path = repo_root() / load_settings()["reports"]["json"]
    if not path.is_file():
        return {
            "status": "Pending",
            "evaluation_kind": "proxy, not official",
            "disclaimer": "make eval has not written reports/results.json.",
            "sections": {
                name: {"status": "Pending"}
                for name in (
                    "classical",
                    "quantum",
                    "pipeline",
                    "runtime",
                    "robustness",
                    "fairness",
                    "queue_sim",
                )
            },
        }
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {"status": "Pending", "disclaimer": "results.json was not a JSON object."}
    return payload
