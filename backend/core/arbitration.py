"""Arbitration across rules, abstention, and models.

Order of authority: Safety-Rule Layer, then abstention, then models.
The combined level is never less urgent than a fired rule, and a fired rule
never makes the result less urgent than the model level.
"""

from __future__ import annotations

from typing import Any, Literal

from core.config_loader import load_department_config, load_settings
from core.red_flags import find_red_flags
from core.safety_rules import apply_safety_rules, combine_levels, rule_floor
from core.schemas import ModelView, TriageDecision
from core.text import normalise_text, phrase_span, script_hint
from core.validation import validate_intake

_ABSTAIN_MESSAGE = "Cannot assess, send to nurse now"


def uncertainty_from_probability(probability: float) -> float:
    """Map a probability to [0, 1]. 0 is most certain and 1 is p = 0.5."""
    return 1.0 - abs(probability - 0.5) * 2.0


def keyword_department(complaint: str | None) -> str | None:
    """Department hint from complaint phrases. Not a diagnosis. Not a model."""
    text = normalise_text(complaint)
    if not text:
        return None
    for hint in load_department_config()["hints"]:
        for phrase in hint["phrases"]:
            if phrase_span(text, normalise_text(str(phrase))) is not None:
                return str(hint["department"])
    return None


def _is_urgent(level: int) -> bool:
    return level <= 2


def arbitrate(
    intake: dict[str, Any],
    classical: ModelView | None,
    quantum: ModelView | None,
    *,
    quantum_note: str | None = None,
    illustrative: bool = False,
) -> TriageDecision:
    """Combine validation, the Safety-Rule Layer, and optional model outputs.

    `classical` and `quantum` are already-computed views. This function does
    not load artefacts and does not read hidden labels.
    """
    validation = validate_intake(intake)
    red_flags = find_red_flags(
        None if intake.get("complaint") is None else str(intake.get("complaint"))
    )
    fired = apply_safety_rules(validation, red_flags)
    floor = rule_floor(fired)

    explanation: list[str] = []
    issues = [issue for issue in validation.fields.values() if issue.status != "ok"]
    for issue in issues:
        explanation.append(f"{issue.field}: {issue.detail}")

    script = script_hint(None if intake.get("complaint") is None else str(intake.get("complaint")))
    if script != "Latin":
        explanation.append(
            f"Complaint characters include {script}. This is not a language identification."
        )

    for flag in red_flags:
        explanation.append(f"Red flag {flag.label}: matched “{flag.phrase}”. Not a diagnosis.")
    for rule in fired:
        reviewed = "clinically reviewed" if rule.clinically_reviewed else "not clinically reviewed"
        explanation.append(
            f"Safety-Rule Layer {rule.id}: {rule.reason} "
            f"Minimum level {rule.min_level} ({reviewed})."
        )

    model_levels: list[int] = []
    if classical is not None:
        model_levels.append(classical.level)
        explanation.append(
            f"Classical ML level {classical.level}, "
            f"emergency probability {classical.p_emergency:.3f}."
        )
    else:
        explanation.append("Classical ML artefact is not available.")
    if quantum is not None:
        model_levels.append(quantum.level)
        explanation.append(
            "Quantum ML (experimental, simulator only) "
            f"level {quantum.level}, risk score {quantum.p_emergency:.3f}. "
            "No speedup or advantage is claimed."
        )
    elif quantum_note:
        explanation.append(quantum_note)

    models_disagree = False
    model_level: int | None = min(model_levels) if model_levels else None
    if (
        classical is not None
        and quantum is not None
        and _is_urgent(classical.level) != _is_urgent(quantum.level)
    ):
        models_disagree = True
        explanation.append(
            "Models disagree on emergency. Escalated to the more urgent view for Nurse Review."
        )

    settings = load_settings()
    max_uncertainty = float(settings["abstention"]["max_uncertainty"])
    uncertainty = None if classical is None else uncertainty_from_probability(classical.p_emergency)

    abstain_reasons: list[str] = []
    if validation.unassessable:
        abstain_reasons.extend(validation.abstain_reasons or [_ABSTAIN_MESSAGE])
    if classical is None:
        abstain_reasons.append(
            "Classical ML artefact is not available. Cannot assess, send to nurse now."
        )
    elif uncertainty is not None and uncertainty >= max_uncertainty and floor is None:
        abstain_reasons.append("Classical ML confidence is low. Cannot assess, send to nurse now.")

    triage_level = combine_levels(floor, model_level)
    department, department_source = _department(classical, intake)
    if department_source == "classical":
        explanation.append("Recommended department is from Classical ML.")
    elif department_source == "keyword_hint":
        explanation.append(
            "Department is a keyword hint because Classical ML did not provide one. "
            "Not a diagnosis."
        )

    if illustrative:
        explanation.append("Example, not a real clinical outcome.")

    return TriageDecision(
        triage_level=triage_level,
        department=department,
        department_source=department_source,
        red_flags=red_flags,
        fired_rules=fired,
        abstain=bool(abstain_reasons),
        abstain_reasons=_unique(abstain_reasons),
        uncertainty=uncertainty,
        classical=classical,
        quantum=quantum,
        quantum_note=quantum_note,
        models_disagree=models_disagree,
        validation_issues=issues,
        explanation=explanation,
        illustrative=illustrative,
        source_label="Example, not a real clinical outcome" if illustrative else None,
    )


def _department(
    classical: ModelView | None, intake: dict[str, Any]
) -> tuple[str | None, Literal["classical", "keyword_hint"] | None]:
    if classical is not None and classical.department:
        return classical.department, "classical"
    hint = keyword_department(
        None if intake.get("complaint") is None else str(intake.get("complaint"))
    )
    if hint is None:
        return None, None
    return hint, "keyword_hint"


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered
