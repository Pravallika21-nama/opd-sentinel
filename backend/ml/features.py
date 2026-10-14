"""Shared feature matrix for Classical ML.

Quantum ML uses the imputed numeric columns selected during its own training.
Hidden labels are not columns of this matrix.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import StandardScaler

from core.constants import LABEL_FIELDS, NUMERIC_FIELDS, SOURCE_FIELD
from core.preprocessing import (
    condition_features,
    fit_numeric_medians,
    medication_features,
    normalised_complaint,
    prepare_numeric,
    sex_features,
)
from core.red_flags import find_red_flags
from core.validation import validate_intake
from ml.dataset import iter_intakes

BANNED_FEATURE_NAMES = set(LABEL_FIELDS) | {SOURCE_FIELD, "case_id"}


class FeatureBuilder:
    """Fit on training rows only. Transform never reads hidden labels."""

    def __init__(self, max_features: int, ngram_min: int, ngram_max: int, min_df: int = 2) -> None:
        self.max_features = max_features
        self.ngram_min = ngram_min
        self.ngram_max = ngram_max
        self.min_df = min_df
        self.medians: dict[str, float] = {}
        self.numeric_names: list[str] = []
        self.scale_index: list[int] = []
        self.scaler = StandardScaler()
        self.vectorizer = TfidfVectorizer(
            analyzer="char_wb",
            ngram_range=(ngram_min, ngram_max),
            max_features=max_features,
            min_df=min_df,
            lowercase=True,
        )
        self.text_names: list[str] = []

    def fit(self, frame: pd.DataFrame) -> FeatureBuilder:
        """Fit medians, the vital scaler, and character n-grams on this frame only."""
        intakes = iter_intakes(frame)
        validations = [validate_intake(intake) for intake in intakes]
        self.medians = fit_numeric_medians(list(zip(intakes, validations, strict=True)))
        numeric_rows = [
            self._numeric_dict(intake, validation)
            for intake, validation in zip(intakes, validations, strict=True)
        ]
        self.numeric_names = list(numeric_rows[0].keys())
        self._reject_banned(self.numeric_names)
        matrix = self._stack(numeric_rows)
        self.scale_index = [self.numeric_names.index(name) for name in NUMERIC_FIELDS]
        self.scaler.fit(matrix[:, self.scale_index])
        texts = [normalised_complaint(intake.get("complaint")) for intake in intakes]
        if not any(texts):
            texts = ["empty"]
        self.vectorizer.fit(texts)
        self.text_names = [f"ngram:{name}" for name in self.vectorizer.get_feature_names_out()]
        self._reject_banned(self.text_names)
        return self

    def transform(self, frame: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
        """Return the dense matrix and column names."""
        intakes = iter_intakes(frame)
        numeric_rows = [self._numeric_dict(intake, validate_intake(intake)) for intake in intakes]
        numeric = self._scaled(self._stack(numeric_rows))
        texts = [normalised_complaint(intake.get("complaint")) or " " for intake in intakes]
        text = self.vectorizer.transform(texts).toarray()
        names = self.numeric_names + self.text_names
        self._reject_banned(names)
        return np.hstack([numeric, text]).astype(np.float64), names

    def transform_one(self, intake: dict[str, Any]) -> np.ndarray:
        """Vector for one case."""
        frame = pd.DataFrame([intake])
        matrix, _names = self.transform(frame)
        return matrix

    def continuous_matrix(self, frame: pd.DataFrame) -> np.ndarray:
        """Imputed age and vitals, unscaled. Quantum ML selects from these columns."""
        rows = []
        for intake in iter_intakes(frame):
            prepared = prepare_numeric(validate_intake(intake), self.medians)
            rows.append([prepared[name] for name in NUMERIC_FIELDS])
        return np.asarray(rows, dtype=np.float64)

    def _numeric_dict(self, intake: dict[str, Any], validation: Any) -> dict[str, float]:
        features = prepare_numeric(validation, self.medians)
        features.update(sex_features(intake.get("sex")))
        features.update(condition_features(intake.get("known_conditions")))
        features.update(medication_features(intake.get("medications")))
        features["red_flag_count"] = float(len(find_red_flags(intake.get("complaint"))))
        return features

    def _stack(self, rows: list[dict[str, float]]) -> np.ndarray:
        return np.asarray(
            [[row[name] for name in self.numeric_names] for row in rows], dtype=np.float64
        )

    def _scaled(self, matrix: np.ndarray) -> np.ndarray:
        scaled = matrix.copy()
        scaled[:, self.scale_index] = self.scaler.transform(matrix[:, self.scale_index])
        return scaled

    @staticmethod
    def _reject_banned(names: list[str]) -> None:
        banned = BANNED_FEATURE_NAMES.intersection(names)
        if banned:
            raise RuntimeError(f"Label leakage in features: {sorted(banned)}")
