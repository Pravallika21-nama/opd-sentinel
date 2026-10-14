"""Plausibility checks. Raw values are kept."""

from core.validation import validate_intake

_BASE = {
    "age": 40,
    "sex": "female",
    "systolic_bp": 120,
    "diastolic_bp": 80,
    "pulse": 76,
    "temperature_c": 36.8,
    "spo2": 98,
    "complaint": "cough",
}


def test_bp_zero_is_implausible_and_kept() -> None:
    result = validate_intake({**_BASE, "systolic_bp": 0})
    issue = result.fields["systolic_bp"]
    assert issue.status == "implausible"
    assert issue.raw == 0


def test_temp_96_is_unit_conflict_and_not_converted() -> None:
    result = validate_intake({**_BASE, "temperature_c": 96})
    issue = result.fields["temperature_c"]
    assert issue.status == "conflicting"
    assert issue.raw == 96
    assert "not converted" in issue.detail.lower() or "kept" in issue.detail.lower()


def test_spo2_above_100_is_implausible() -> None:
    result = validate_intake({**_BASE, "spo2": 140})
    assert result.fields["spo2"].status == "implausible"
    assert result.fields["spo2"].raw == 140


def test_missing_vitals_with_empty_complaint_are_unassessable() -> None:
    result = validate_intake(
        {
            "age": 50,
            "sex": "male",
            "systolic_bp": None,
            "diastolic_bp": 80,
            "pulse": None,
            "temperature_c": None,
            "spo2": None,
            "complaint": "",
        }
    )
    assert result.fields["pulse"].status == "missing"
    assert result.fields["spo2"].status == "missing"
    assert result.unassessable is True
    assert any("Cannot assess, send to nurse now" in reason for reason in result.abstain_reasons)


def test_systolic_not_above_diastolic_conflicts() -> None:
    result = validate_intake({**_BASE, "systolic_bp": 80, "diastolic_bp": 90})
    assert result.fields["systolic_bp"].status == "conflicting"
    assert result.fields["systolic_bp"].raw == 80
