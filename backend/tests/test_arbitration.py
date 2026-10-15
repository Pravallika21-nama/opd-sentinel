"""Arbitration: rules, abstention, and a missing Classical ML model."""

from core.arbitration import arbitrate
from core.schemas import ModelView

_NORMAL = {
    "age": 44,
    "sex": "female",
    "systolic_bp": 120,
    "diastolic_bp": 78,
    "pulse": 80,
    "temperature_c": 36.8,
    "spo2": 98,
    "complaint": "halka sardi",
}


def test_rule_overrides_a_mild_model() -> None:
    decision = arbitrate(
        {**_NORMAL, "spo2": 85, "complaint": "feels unwell"},
        ModelView(level=5, p_emergency=0.05, department="General Medicine"),
    )
    assert decision.triage_level == 1
    assert any(rule.id == "spo2_below_90" for rule in decision.fired_rules)


def test_empty_complaint_and_bad_vitals_abstain() -> None:
    decision = arbitrate(
        {
            "age": 50,
            "sex": "male",
            "systolic_bp": 0,
            "diastolic_bp": 80,
            "pulse": None,
            "temperature_c": 96,
            "spo2": None,
            "complaint": "",
        },
        ModelView(level=4, p_emergency=0.1, department="General Medicine"),
    )
    assert decision.abstain is True
    assert any("Cannot assess, send to nurse now" in reason for reason in decision.abstain_reasons)


def test_missing_model_abstains_and_invents_no_level() -> None:
    decision = arbitrate(_NORMAL, None)
    assert decision.classical is None
    assert decision.model_status == "unavailable"
    assert decision.abstain is True
    assert decision.triage_level is None


def test_missing_model_still_applies_rules() -> None:
    decision = arbitrate({**_NORMAL, "spo2": 85}, None)
    assert decision.triage_level == 1
    assert decision.abstain is True


def test_classical_level_is_used_when_no_rule_fires() -> None:
    decision = arbitrate(
        _NORMAL, ModelView(level=4, p_emergency=0.08, department="General Medicine")
    )
    assert decision.model_status == "ok"
    assert decision.triage_level == 4


def test_rule_does_not_downgrade_a_more_urgent_model() -> None:
    decision = arbitrate(
        {**_NORMAL, "spo2": 92},
        ModelView(level=1, p_emergency=0.9, department="Pulmonology"),
    )
    assert any(rule.id == "spo2_below_94" for rule in decision.fired_rules)
    assert decision.triage_level == 1
