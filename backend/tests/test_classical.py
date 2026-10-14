"""Proxy cost and a tiny Classical ML round-trip. The project test split is not used."""

from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.classical import fit_classical
from ml.thresholds import binary_cost


def test_asymmetric_cost_weights_a_miss_twenty_times() -> None:
    stats = binary_cost(np.array([1, 1, 0, 0, 0]), np.array([0, 0, 1, 1, 1]), under=20, over=1)
    assert stats["missed_emergencies"] == 2
    assert stats["false_alerts"] == 3
    assert stats["cost"] == 43


def _tiny_frame(rows: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    records = []
    for index in range(rows):
        emergency = int(index < rows // 4)
        records.append(
            {
                "case_id": f"tiny-{seed}-{index}",
                "age": float(rng.integers(18, 80)),
                "sex": "female" if index % 2 == 0 else "male",
                "systolic_bp": 80 if emergency else 120,
                "diastolic_bp": 50 if emergency else 80,
                "pulse": 130 if emergency else 76,
                "temperature_c": 37.0,
                "spo2": 88 if emergency else 98,
                "complaint": "saans nahi" if emergency else "halka sardi",
                "known_conditions": "",
                "medications": "",
                "triage_level": 1 if emergency else 4,
                "department": "Emergency" if emergency else "General Medicine",
                "emergency": emergency,
                "record_source": "synthetic",
            }
        )
    return pd.DataFrame.from_records(records)


def test_classical_artifact_loads_and_predicts(tmp_path: Path) -> None:
    train = _tiny_frame(48, 1)
    val = _tiny_frame(24, 2)
    bundle = fit_classical(
        train,
        val,
        seed=42,
        class_weight=20,
        max_features=20,
        ngram_min=2,
        ngram_max=3,
        min_df=1,
        candidates=("logistic_regression",),
    )
    path = tmp_path / "classical.joblib"
    joblib.dump(bundle, path)
    loaded = joblib.load(path)
    view = loaded.predict_intake(train.iloc[0].to_dict())
    assert 1 <= view.level <= 5
    assert 0.0 <= view.p_emergency <= 1.0
    assert bundle.metadata["test_set_used"] is False
