"""Domain objects shared by the pipeline and the API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

FieldStatus = Literal["ok", "missing", "implausible", "conflicting"]


class ValidationIssue(BaseModel):
    """One intake field after plausibility checks. `raw` is the entered value."""

    field: str
    status: FieldStatus
    raw: Any = None
    detail: str


class ValidationResult(BaseModel):
    """Plausibility outcome. Nothing here rewrites the nurse's entry."""

    fields: dict[str, ValidationIssue]
    complaint_empty: bool
    unassessable: bool
    abstain_reasons: list[str] = Field(default_factory=list)


class RedFlagMatch(BaseModel):
    """A lexicon hit. A match is not a diagnosis."""

    id: str
    label: str
    phrase: str


class FiredRule(BaseModel):
    """A Safety-Rule Layer rule that fired. It can only raise urgency."""

    id: str
    description: str
    min_level: int = Field(ge=1, le=5)
    reason: str
    clinically_reviewed: bool


class ModelView(BaseModel):
    """One model's suggestion for a single case."""

    level: int = Field(ge=1, le=5)
    p_emergency: float = Field(ge=0.0, le=1.0)
    department: str | None = None


class TriageDecision(BaseModel):
    """Arbitration output. Lower `triage_level` is more urgent."""

    triage_level: int | None = Field(default=None, ge=1, le=5)
    department: str | None = None
    department_source: Literal["classical", "keyword_hint"] | None = None
    red_flags: list[RedFlagMatch] = Field(default_factory=list)
    fired_rules: list[FiredRule] = Field(default_factory=list)
    abstain: bool = False
    abstain_reasons: list[str] = Field(default_factory=list)
    uncertainty: float | None = Field(default=None, ge=0.0, le=1.0)
    classical: ModelView | None = None
    quantum: ModelView | None = None
    quantum_note: str | None = None
    models_disagree: bool = False
    validation_issues: list[ValidationIssue] = Field(default_factory=list)
    explanation: list[str] = Field(default_factory=list)
    illustrative: bool = False
    source_label: str | None = None
