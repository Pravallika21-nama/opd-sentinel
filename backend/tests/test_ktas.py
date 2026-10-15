"""The KTAS adapter keeps recorded values, drops nothing silently, and leaks no outcome."""

import math

import pandas as pd

from core.constants import INTAKE_FIELDS, LABEL_FIELDS
from ml.ktas import REFERENCE_NURSE_FIELD, UNUSED_COLUMNS, ktas_to_intake


def _workbook() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Group": [1, 2, 1],
            "Sex": [1, 2, 2],
            "Age": [71.0, 56.0, 30.0],
            "Patients number per hour": [3, 12, 5],
            "Arrival mode": [3, 3, 1],
            "Injury": [2, 1, 1],
            "Chief_complain": ["right ocular pain", "dyspnea", "목이 아픔"],
            "Mental": [1, 1, 1],
            "Pain": [1, 0, 1],
            "NRS_pain": [2.0, None, 3.0],
            "SBP": ["160", "측불", "120"],
            "DBP": ["100", "측불", "80"],
            "HR": ["84", "130", "76"],
            "RR": ["18", "28", "18"],
            "BT": ["36.6", "37.0", "36.8"],
            "Saturation": ["100", None, "98"],
            "KTAS_RN": [2, 2, 4],
            "Diagnosis in ED": ["Corneal abrasion", "Pneumonia", "Pharyngitis"],
            "Disposition": [1, 2, 1],
            "KTAS_expert": [4, 2, 9],
            "Error_group": [2, 0, 0],
            "Length of stay_min": [86.0, 400.0, 30.0],
            "KTAS duration_min": [5.0, 2.0, 1.0],
            "mistriage": [1, 0, 0],
        }
    )


def test_mapping_keeps_values_and_counts_unmeasurable() -> None:
    frame, profile = ktas_to_intake(_workbook())
    assert profile["rows_dropped_invalid_label"] == 1
    assert len(frame) == 2
    assert frame.loc[0, "sex"] == "female"
    assert frame.loc[1, "sex"] == "male"
    assert frame.loc[0, "systolic_bp"] == 160
    assert math.isnan(frame.loc[1, "systolic_bp"])
    assert profile["unmeasurable"]["systolic_bp"] == 1
    assert profile["blank"]["spo2"] == 1
    assert frame.loc[0, "triage_level"] == 4
    assert frame.loc[0, "emergency"] == 0
    assert frame.loc[1, "emergency"] == 1
    assert frame.loc[1, REFERENCE_NURSE_FIELD] == 2


def test_outcome_columns_are_not_carried_over() -> None:
    frame, _profile = ktas_to_intake(_workbook())
    allowed = (
        set(INTAKE_FIELDS)
        | set(LABEL_FIELDS)
        | {
            "case_id",
            "record_source",
            REFERENCE_NURSE_FIELD,
        }
    )
    assert set(frame.columns) <= allowed
    for leaked in ("Diagnosis in ED", "Disposition", "mistriage", "Length of stay_min"):
        assert leaked in UNUSED_COLUMNS
        assert leaked not in frame.columns
