"""Splits, the column map, and the feature matrix."""

from pathlib import Path

import pandas as pd
import pytest

from core.constants import LABEL_FIELDS
from ml.dataset import apply_column_map, load_split, write_splits
from ml.features import FeatureBuilder


def _frame(rows: int = 40) -> pd.DataFrame:
    records = []
    for index in range(rows):
        emergency = int(index % 10 == 0)
        records.append(
            {
                "case_id": f"id-{index:03d}",
                "age": 20 + index,
                "sex": "female" if index % 2 == 0 else "male",
                "systolic_bp": 110 + (index % 7),
                "diastolic_bp": 70,
                "pulse": 75,
                "temperature_c": 36.7,
                "spo2": 98 if not emergency else 86,
                "complaint": "seene mein dard" if emergency else "halka sardi",
                "known_conditions": "diabetes" if index % 3 == 0 else "",
                "medications": "metformin" if index % 3 == 0 else "",
                "triage_level": 2 if emergency else 4,
                "department": "Cardiology" if emergency else "General Medicine",
                "emergency": emergency,
                "record_source": "synthetic",
            }
        )
    return pd.DataFrame.from_records(records)


def test_splits_do_not_share_ids(tmp_path: Path) -> None:
    counts = write_splits(
        _frame(80), tmp_path, seed=42, fractions={"train": 0.7, "val": 0.15, "test": 0.15}
    )
    frames = {name: pd.read_csv(tmp_path / f"{name}.csv") for name in counts}
    train_ids = set(frames["train"]["case_id"])
    val_ids = set(frames["val"]["case_id"])
    test_ids = set(frames["test"]["case_id"])
    assert train_ids.isdisjoint(val_ids)
    assert train_ids.isdisjoint(test_ids)
    assert val_ids.isdisjoint(test_ids)


def test_labels_are_not_features() -> None:
    frame = _frame(30)
    builder = FeatureBuilder(max_features=30, ngram_min=2, ngram_max=3, min_df=1)
    builder.fit(frame)
    _matrix, names = builder.transform(frame)
    assert LABEL_FIELDS
    assert set(names).isdisjoint(set(LABEL_FIELDS) | {"case_id", "record_source"})


def test_test_split_is_blocked_for_training() -> None:
    with pytest.raises(RuntimeError, match="held-out"):
        load_split("test", allow_test=False)


def test_column_map_renames_and_does_not_guess() -> None:
    frame = _frame(2).rename(columns={"age": "AgeYears", "complaint": "ChiefComplaint"})
    mapped = apply_column_map(
        frame,
        {
            "case_id": None,
            "age": "AgeYears",
            "sex": None,
            "systolic_bp": None,
            "diastolic_bp": None,
            "pulse": None,
            "temperature_c": None,
            "spo2": None,
            "complaint": "ChiefComplaint",
            "known_conditions": None,
            "medications": None,
            "record_source": None,
            "triage_level": None,
            "department": None,
            "emergency": None,
        },
    )
    assert "age" in mapped.columns
    assert "complaint" in mapped.columns
    with pytest.raises(KeyError, match="not guessed"):
        apply_column_map(frame, {"age": "not_a_real_header"})
