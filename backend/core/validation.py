"""Intake plausibility checks.

Raw entries are preserved. Implausible values are flagged, not rewritten.
Every threshold in the YAML is a placeholder until a clinician reviews it.
"""

from __future__ import annotations

import math
import numbers
from typing import Any, Final, Literal

from core.config_loader import load_validation_config
from core.constants import NUMERIC_FIELDS
from core.schemas import ValidationIssue, ValidationResult
from core.text import normalise_text

FieldStatus = Literal["ok", "missing", "implausible", "conflicting"]
_STATUS_OK: Final[FieldStatus] = "ok"
_STATUS_MISSING: Final[FieldStatus] = "missing"
_STATUS_IMPLAUSIBLE: Final[FieldStatus] = "implausible"
_STATUS_CONFLICTING: Final[FieldStatus] = "conflicting"


def _parse_number(value: Any) -> tuple[float | None, str | None]:
    """Return `(number, problem)`.

    `problem` is `missing`, `not_a_number`, or None when parsing succeeded.
    NaN counts as missing. Booleans are not numbers.
    """
    if value is None:
        return None, "missing"
    if isinstance(value, str):
        stripped = value.strip()
        if stripped == "":
            return None, "missing"
        try:
            value = float(stripped)
        except ValueError:
            return None, "not_a_number"
    if isinstance(value, bool) or not isinstance(value, numbers.Real):
        return None, "not_a_number"
    number = float(value)
    if math.isnan(number) or math.isinf(number):
        return None, "missing" if math.isnan(number) else "not_a_number"
    return number, None


def _range_status(number: float, minimum: float, maximum: float) -> FieldStatus:
    if minimum <= number <= maximum:
        return _STATUS_OK
    return _STATUS_IMPLAUSIBLE


def validate_intake(intake: dict[str, Any]) -> ValidationResult:
    """Check one intake dict against `config/validation_ranges.yaml`.

    Temperature values that sit in the Fahrenheit window and outside the
    Celsius window are `conflicting` (unit mix-up). The entered number is kept.
    """
    config = load_validation_config()
    ranges: dict[str, Any] = config["fields"]
    unit_cfg: dict[str, Any] = config["temperature_unit"]
    fields: dict[str, ValidationIssue] = {}
    numbers: dict[str, float | None] = {}

    for name in NUMERIC_FIELDS:
        raw = intake.get(name)
        number, problem = _parse_number(raw)
        numbers[name] = number
        spec = ranges[name]
        if problem == "missing":
            fields[name] = ValidationIssue(
                field=name,
                status=_STATUS_MISSING,
                raw=None if raw is None or (isinstance(raw, str) and raw.strip() == "") else raw,
                detail="No value entered.",
            )
            continue
        if problem == "not_a_number":
            fields[name] = ValidationIssue(
                field=name,
                status=_STATUS_IMPLAUSIBLE,
                raw=raw,
                detail="Value is not a number. The entry was kept.",
            )
            continue
        assert number is not None
        if name == "temperature_c":
            fields[name] = _temperature_issue(raw, number, spec, unit_cfg)
            continue
        status = _range_status(number, float(spec["min"]), float(spec["max"]))
        if status == _STATUS_OK:
            detail = "Within the placeholder range."
        else:
            detail = (
                f"Outside the placeholder range {spec['min']}–{spec['max']} {spec['unit']}. "
                "The entry was kept."
            )
        fields[name] = ValidationIssue(field=name, status=status, raw=raw, detail=detail)

    _mark_bp_conflict(fields, numbers)

    sex_raw = intake.get("sex")
    sex_text = "" if sex_raw is None else str(sex_raw).strip()
    if sex_text == "":
        fields["sex"] = ValidationIssue(
            field="sex", status=_STATUS_MISSING, raw=None, detail="No value entered."
        )
    else:
        fields["sex"] = ValidationIssue(
            field="sex", status=_STATUS_OK, raw=sex_raw, detail="Entered text kept."
        )

    complaint = normalise_text(
        None if intake.get("complaint") is None else str(intake.get("complaint"))
    )
    complaint_empty = complaint == ""
    unassessable, reasons = _unassessable(fields, complaint_empty, config["unassessable"])
    return ValidationResult(
        fields=fields,
        complaint_empty=complaint_empty,
        unassessable=unassessable,
        abstain_reasons=reasons,
    )


def _temperature_issue(
    raw: Any, number: float, spec: dict[str, Any], unit_cfg: dict[str, Any]
) -> ValidationIssue:
    celsius_ok = float(spec["min"]) <= number <= float(spec["max"])
    fahrenheit_like = (
        float(unit_cfg["fahrenheit_min"]) <= number <= float(unit_cfg["fahrenheit_max"])
    )
    if celsius_ok:
        return ValidationIssue(
            field="temperature_c",
            status=_STATUS_OK,
            raw=raw,
            detail="Within the placeholder Celsius range.",
        )
    if fahrenheit_like:
        return ValidationIssue(
            field="temperature_c",
            status=_STATUS_CONFLICTING,
            raw=raw,
            detail=(
                "Value sits in the Fahrenheit window and outside the Celsius window. "
                "Possible unit mix-up. The entry was kept and was not converted."
            ),
        )
    return ValidationIssue(
        field="temperature_c",
        status=_STATUS_IMPLAUSIBLE,
        raw=raw,
        detail=(
            f"Outside the placeholder Celsius range {spec['min']}–{spec['max']}. "
            "The entry was kept."
        ),
    )


def _mark_bp_conflict(fields: dict[str, ValidationIssue], numbers: dict[str, float | None]) -> None:
    systolic = fields["systolic_bp"]
    diastolic = fields["diastolic_bp"]
    if systolic.status != _STATUS_OK or diastolic.status != _STATUS_OK:
        return
    sbp = numbers["systolic_bp"]
    dbp = numbers["diastolic_bp"]
    if sbp is None or dbp is None or sbp > dbp:
        return
    detail = "Systolic pressure is not above diastolic pressure. Both entries were kept."
    fields["systolic_bp"] = systolic.model_copy(
        update={"status": _STATUS_CONFLICTING, "detail": detail}
    )
    fields["diastolic_bp"] = diastolic.model_copy(
        update={"status": _STATUS_CONFLICTING, "detail": detail}
    )


def _unassessable(
    fields: dict[str, ValidationIssue], complaint_empty: bool, policy: dict[str, Any]
) -> tuple[bool, list[str]]:
    """Placeholder abstention policy from config. Not clinically reviewed."""
    critical: list[str] = list(policy["critical_fields"])
    bad_states = {"missing", "implausible", "conflicting"}
    bad = [name for name in critical if fields[name].status in bad_states]
    reasons: list[str] = []
    if complaint_empty and len(bad) >= int(policy["min_bad_critical_fields"]):
        joined = ", ".join(bad)
        reasons.append(
            "Cannot assess, send to nurse now. "
            f"Complaint is empty and these critical fields are missing or unusable: {joined}."
        )
        return True, reasons
    return False, reasons
