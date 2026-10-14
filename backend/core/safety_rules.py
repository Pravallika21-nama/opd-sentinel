"""Safety-Rule Layer.

Rules may only keep or raise urgency. They never downgrade a triage level.
A lower level number is more urgent. Every threshold stays
`clinically_reviewed: false` until a clinician signs it.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from core.config_loader import load_safety_config
from core.schemas import FiredRule, RedFlagMatch, ValidationResult


@dataclass(frozen=True)
class _Context:
    values: dict[str, float | None]
    status: dict[str, str]
    red_flags: set[str]


class SafetyRuleSet:
    """Declarative rules from `config/safety_rules.yaml`."""

    def __init__(self, rules: list[dict[str, Any]]) -> None:
        self.rules = rules

    def apply(self, validation: ValidationResult, red_flags: list[RedFlagMatch]) -> list[FiredRule]:
        """Return every rule that fires. The caller takes the minimum level."""
        context = _context_from(validation, red_flags)
        fired: list[FiredRule] = []
        for rule in self.rules:
            if _matches(rule["condition"], context):
                fired.append(
                    FiredRule(
                        id=rule["id"],
                        description=rule["description"],
                        min_level=int(rule["min_level"]),
                        reason=rule["reason"],
                        clinically_reviewed=bool(rule["clinically_reviewed"]),
                    )
                )
        return fired


def combine_levels(rule_level: int | None, model_level: int | None) -> int | None:
    """More urgent wins. A missing side does not invent a level.

    When both exist, the result is `min(rule_level, model_level)`. A rule
    therefore cannot produce a less urgent level than the model.
    """
    if rule_level is None:
        return model_level
    if model_level is None:
        return rule_level
    return min(rule_level, model_level)


def rule_floor(fired: list[FiredRule]) -> int | None:
    """Minimum forced level, or None when no rule fired."""
    if not fired:
        return None
    return min(rule.min_level for rule in fired)


@lru_cache(maxsize=1)
def get_rule_set() -> SafetyRuleSet:
    """Load and cache the Safety-Rule Layer."""
    config = load_safety_config()
    return SafetyRuleSet(list(config["rules"]))


def apply_safety_rules(
    validation: ValidationResult, red_flags: list[RedFlagMatch]
) -> list[FiredRule]:
    """Evaluate the configured rules for one case."""
    return get_rule_set().apply(validation, red_flags)


def _stored_number(raw: Any) -> float | None:
    """Float from a preserved raw entry, including numpy scalars and numeric strings."""
    if raw is None or isinstance(raw, bool):
        return None
    if isinstance(raw, str):
        try:
            return float(raw.strip())
        except ValueError:
            return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _context_from(validation: ValidationResult, red_flags: list[RedFlagMatch]) -> _Context:
    values: dict[str, float | None] = {}
    status: dict[str, str] = {}
    for name, issue in validation.fields.items():
        status[name] = issue.status
        values[name] = _stored_number(issue.raw)
    return _Context(values=values, status=status, red_flags={item.id for item in red_flags})


def _matches(condition: dict[str, Any], context: _Context) -> bool:
    if "all" in condition:
        return all(_matches(item, context) for item in condition["all"])
    if "any" in condition:
        return any(_matches(item, context) for item in condition["any"])
    if "red_flag" in condition:
        return str(condition["red_flag"]) in context.red_flags
    field = str(condition["field"])
    required = str(condition.get("require_status", "ok"))
    if context.status.get(field) != required:
        return False
    value = context.values.get(field)
    if value is None:
        return False
    target = float(condition["value"])
    op = str(condition["op"])
    comparisons = {
        "lt": value < target,
        "lte": value <= target,
        "gt": value > target,
        "gte": value >= target,
        "eq": value == target,
    }
    if op not in comparisons:
        raise ValueError(f"Unknown safety-rule operator: {op}")
    return comparisons[op]
