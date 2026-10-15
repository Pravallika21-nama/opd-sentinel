"""MIMIC-IV-ED Demo adapter: column mapping, unit conversion, and reference labels."""

import math
from pathlib import Path

import pandas as pd
import pytest

from ml.dataset import iter_intakes
from ml.mimic_demo import fahrenheit_to_celsius, mimic_demo_to_intake, read_tables


def _frames() -> dict[str, pd.DataFrame]:
    triage = pd.DataFrame(
        {
            "subject_id": [1, 1, 2],
            "stay_id": [10, 11, 20],
            "temperature": [98.6, 36.5, None],
            "heartrate": [80, 120, 90],
            "resprate": [16, 24, 18],
            "o2sat": [98, 91, 99],
            "sbp": [120, 90, 140],
            "dbp": [80, 60, 85],
            "pain": ["0", "8", "unable"],
            "acuity": [3.0, 1.0, None],
            "chiefcomplaint": ["Abd pain", "SOB, CHEST PAIN", None],
        }
    )
    stays = pd.DataFrame(
        {
            "subject_id": [1, 1, 2],
            "hadm_id": [None, 5.0, None],
            "stay_id": [10, 11, 20],
            "intime": ["2150-01-01 10:00:00", "2152-06-01 08:00:00", "2130-03-03 12:00:00"],
            "outtime": ["2150-01-01 14:30:00", "2152-06-01 20:00:00", "2130-03-03 13:00:00"],
            "gender": ["F", "F", "M"],
            "race": ["", "", ""],
            "arrival_transport": ["WALK IN", "AMBULANCE", None],
            "disposition": ["HOME", "ADMITTED", "HOME"],
        }
    )
    patients = pd.DataFrame(
        {
            "subject_id": [1, 2],
            "gender": ["F", "M"],
            "anchor_age": [50, 30],
            "anchor_year": [2150, 2130],
            "anchor_year_group": ["", ""],
            "dod": [None, None],
        }
    )
    return {"triage": triage, "edstays": stays, "patients": patients, "diagnosis": pd.DataFrame()}


def test_fahrenheit_conversion() -> None:
    converted = fahrenheit_to_celsius(pd.Series([98.6, 212.0, None]))
    assert converted.iloc[0] == 37.0
    assert converted.iloc[1] == 100.0
    assert math.isnan(converted.iloc[2])


def test_mapping_age_labels_and_outcomes() -> None:
    frame, profile = mimic_demo_to_intake(_frames())
    first, second, third = frame.to_dict(orient="records")
    assert first["age"] == 50 and second["age"] == 52
    assert first["sex"] == "female" and third["sex"] == "male"
    assert first["temperature_c"] == 37.0
    assert second["emergency"] == 1.0 and first["emergency"] == 0.0
    assert math.isnan(third["emergency"])
    assert second["admitted"] == 1 and first["admitted"] == 0
    assert first["length_of_stay_min"] == 270.0
    assert profile["acuity_missing"] == 1
    assert profile["temperature_below_50f"] == 1
    assert third["arrival_transport"] == "UNKNOWN"


def test_reference_columns_are_not_model_inputs() -> None:
    frame, _profile = mimic_demo_to_intake(_frames())
    intake = iter_intakes(frame)[0]
    for hidden in ("esi_acuity", "emergency", "admitted", "disposition", "length_of_stay_min"):
        assert hidden not in intake


def test_missing_table_is_reported(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="triage"):
        read_tables(tmp_path)
