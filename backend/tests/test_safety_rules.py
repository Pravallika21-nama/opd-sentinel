"""Safety-Rule Layer. Rules escalate only, and every declared rule has an example."""

from hypothesis import given, settings
from hypothesis import strategies as st

from core.arbitration import arbitrate
from core.config_loader import load_safety_config
from core.red_flags import find_red_flags
from core.safety_rules import apply_safety_rules, combine_levels
from core.schemas import ModelView
from core.validation import validate_intake


def _fired(intake: dict[str, object]) -> list[str]:
    validation = validate_intake(intake)
    complaint = intake.get("complaint")
    flags = find_red_flags(None if complaint is None else str(complaint))
    return [rule.id for rule in apply_safety_rules(validation, flags)]


def test_every_rule_example_fires() -> None:
    for rule in load_safety_config()["rules"]:
        assert rule["clinically_reviewed"] is False
        fired = _fired(rule["example"])
        assert rule["id"] in fired, rule["id"]


def test_implausible_spo2_does_not_force_a_level() -> None:
    fired = _fired(
        {
            "age": 40,
            "sex": "f",
            "systolic_bp": 120,
            "diastolic_bp": 80,
            "pulse": 70,
            "temperature_c": 36.8,
            "spo2": 0,
            "complaint": "cough",
        }
    )
    assert "spo2_below_90" not in fired


def test_fahrenheit_temperature_does_not_force_a_fever_rule() -> None:
    fired = _fired(
        {
            "age": 40,
            "sex": "m",
            "systolic_bp": 120,
            "diastolic_bp": 80,
            "pulse": 70,
            "temperature_c": 96,
            "spo2": 98,
            "complaint": "feverish",
        }
    )
    assert "temp_at_least_40" not in fired
    assert "temp_at_least_41" not in fired


def test_combine_never_downgrades() -> None:
    assert combine_levels(2, 5) == 2
    assert combine_levels(4, 1) == 1
    assert combine_levels(None, 3) == 3
    assert combine_levels(2, None) == 2


@given(
    model_level=st.integers(min_value=1, max_value=5),
    spo2=st.one_of(
        st.none(), st.floats(min_value=50, max_value=100, allow_nan=False, allow_infinity=False)
    ),
    pulse=st.one_of(
        st.none(), st.floats(min_value=30, max_value=220, allow_nan=False, allow_infinity=False)
    ),
    systolic=st.one_of(
        st.none(), st.floats(min_value=60, max_value=250, allow_nan=False, allow_infinity=False)
    ),
    diastolic=st.one_of(
        st.none(), st.floats(min_value=30, max_value=140, allow_nan=False, allow_infinity=False)
    ),
    temperature=st.one_of(
        st.none(), st.floats(min_value=30, max_value=43, allow_nan=False, allow_infinity=False)
    ),
    age=st.one_of(
        st.none(), st.floats(min_value=0, max_value=120, allow_nan=False, allow_infinity=False)
    ),
    complaint=st.text(alphabet="abcdefghijklmnopqrstuvwxyz ", max_size=24),
)
@settings(max_examples=40, deadline=None)
def test_rule_never_downgrades_model(
    model_level: int,
    spo2: float | None,
    pulse: float | None,
    systolic: float | None,
    diastolic: float | None,
    temperature: float | None,
    age: float | None,
    complaint: str,
) -> None:
    """When a rule fires, the issued level is at least as urgent as the model."""
    intake = {
        "age": age,
        "sex": "female",
        "systolic_bp": systolic,
        "diastolic_bp": diastolic,
        "pulse": pulse,
        "temperature_c": temperature,
        "spo2": spo2,
        "complaint": complaint,
    }
    decision = arbitrate(
        intake,
        ModelView(level=model_level, p_emergency=0.2, department="General Medicine"),
    )
    if decision.fired_rules and decision.triage_level is not None:
        assert decision.triage_level <= model_level
        assert decision.triage_level <= min(rule.min_level for rule in decision.fired_rules)
