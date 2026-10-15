"""Feature preprocessing for Classical ML.

Imputation is for the model matrix only. The raw intake is never rewritten.
Hidden labels are not read here.
"""

from __future__ import annotations

import numbers
import re
from typing import Any

from core.constants import NUMERIC_FIELDS
from core.schemas import ValidationResult
from core.text import normalise_text, phrase_span

# Fixed lexicons. These are not learned from labels.
CONDITION_TERMS: dict[str, tuple[str, ...]] = {
    "diabetes": ("diabetes", "diabetic", "madhumeh", "sugar", "chakkarini"),
    "hypertension": ("hypertension", "high bp", "raktachaap", "raktha pothu"),
    "asthma": ("asthma", "damma", "dama"),
    "heart": ("heart disease", "cardiac", "hridaya", "gunde rogam"),
    "pregnancy": ("pregnant", "pregnancy", "garbh", "antenatal"),
    "kidney": ("kidney", "ckd", "gurda"),
}

MEDICATION_TERMS: dict[str, tuple[str, ...]] = {
    "insulin": ("insulin",),
    "blood_thinner": ("warfarin", "aspirin", "blood thinner", "heparin"),
    "inhaler": ("inhaler", "salbutamol", "pump"),
    "steroid": ("steroid", "prednisolone"),
}


def fit_numeric_medians(pairs: list[tuple[dict[str, Any], ValidationResult]]) -> dict[str, float]:
    """Median of plausible training values for each numeric field.

    Implausible and missing entries do not enter the median.
    """
    buckets: dict[str, list[float]] = {name: [] for name in NUMERIC_FIELDS}
    for _intake, validation in pairs:
        for name in NUMERIC_FIELDS:
            issue = validation.fields[name]
            if issue.status != "ok" or isinstance(issue.raw, bool):
                continue
            if not isinstance(issue.raw, numbers.Real):
                continue
            buckets[name].append(float(issue.raw))
    medians: dict[str, float] = {}
    for name, values in buckets.items():
        if not values:
            medians[name] = 0.0
            continue
        ordered = sorted(values)
        mid = len(ordered) // 2
        if len(ordered) % 2:
            medians[name] = ordered[mid]
        else:
            medians[name] = (ordered[mid - 1] + ordered[mid]) / 2
    return medians


def prepare_numeric(validation: ValidationResult, medians: dict[str, float]) -> dict[str, float]:
    """Imputed numerics plus missing and implausible indicators.

    An implausible or conflicting value is replaced in the *feature* by the
    training median and flagged. The raw field on the validation result stays
    as entered.
    """
    features: dict[str, float] = {}
    for name in NUMERIC_FIELDS:
        issue = validation.fields[name]
        usable = (
            issue.status == "ok"
            and not isinstance(issue.raw, bool)
            and isinstance(issue.raw, numbers.Real)
        )
        if usable:
            features[name] = float(issue.raw)
        else:
            features[name] = float(medians.get(name, 0.0))
        features[f"{name}_missing"] = 1.0 if issue.status == "missing" else 0.0
        features[f"{name}_implausible"] = (
            1.0 if issue.status in {"implausible", "conflicting"} else 0.0
        )
    features["temperature_unit_conflict"] = (
        1.0 if validation.fields["temperature_c"].status == "conflicting" else 0.0
    )
    return features


def sex_features(sex: Any) -> dict[str, float]:
    """Map entered sex text to three flags. Unrecognised text is `sex_unknown`."""
    token = normalise_text(None if sex is None else str(sex))
    male = {"m", "male", "man", "purush", "magadu", "aadami"}
    female = {"f", "female", "mahila", "stree", "stri", "aadadi", "aadadhi", "woman"}
    features = {"sex_male": 0.0, "sex_female": 0.0, "sex_unknown": 0.0}
    if token in male:
        features["sex_male"] = 1.0
    elif token in female:
        features["sex_female"] = 1.0
    else:
        features["sex_unknown"] = 1.0
    return features


def _any_term(text: str, terms: tuple[str, ...]) -> float:
    for term in terms:
        if phrase_span(text, normalise_text(term)) is not None:
            return 1.0
    return 0.0


def condition_features(known_conditions: Any) -> dict[str, float]:
    """Binary comorbidity flags from the free-text condition list."""
    text = normalise_text(None if known_conditions is None else str(known_conditions))
    return {f"condition_{name}": _any_term(text, terms) for name, terms in CONDITION_TERMS.items()}


def medication_features(medications: Any) -> dict[str, float]:
    """Medication flags and a capped count of comma-separated entries."""
    raw = "" if medications is None else str(medications)
    text = normalise_text(raw)
    features = {f"med_{name}": _any_term(text, terms) for name, terms in MEDICATION_TERMS.items()}
    if text == "":
        features["medication_count"] = 0.0
        return features
    parts = [part for part in re.split(r"[,+;/]| and ", text) if part.strip()]
    features["medication_count"] = float(min(len(parts), 10))
    return features


def normalised_complaint(complaint: Any) -> str:
    """Normalised complaint for n-gram features. Callers keep the original separately."""
    return normalise_text(None if complaint is None else str(complaint))
