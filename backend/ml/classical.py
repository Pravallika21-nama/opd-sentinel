"""Classical ML path.

Model choice follows the asymmetric emergency cost on the validation split,
not plain accuracy. The test split is not used here.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression

from core.schemas import ModelView
from ml.features import FeatureBuilder
from ml.thresholds import binary_cost, level_emergency_cost, tune_threshold

CANDIDATES = ("logistic_regression", "hist_gradient_boosting")


class ClassicalBundle:
    """Fitted Classical ML artefacts for one training run."""

    def __init__(self) -> None:
        self.builder: FeatureBuilder | None = None
        self.emergency_model: Any = None
        self.emergency_name: str = ""
        self.emergency_threshold: float = 0.5
        self.triage_model: Any = None
        self.triage_name: str = ""
        self.department_model: Any = None
        self.department_name: str = ""
        self.metadata: dict[str, Any] = {}

    def predict_intake(self, intake: dict[str, Any]) -> ModelView:
        """Score one intake. Hidden labels are not read."""
        if self.builder is None or self.emergency_model is None or self.triage_model is None:
            raise RuntimeError("Classical ML bundle is not fitted")
        matrix = self.builder.transform_one(intake)
        probability = float(self.emergency_model.predict_proba(matrix)[0, 1])
        level = int(self.triage_model.predict(matrix)[0])
        level = min(5, max(1, level))
        if probability >= self.emergency_threshold:
            level = min(level, 2)
        department = None
        if self.department_model is not None:
            department = str(self.department_model.predict(matrix)[0])
        return ModelView(level=level, p_emergency=probability, department=department)

    def predict_frame(self, frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Return emergency probabilities, triage levels, and departments for a frame."""
        if self.builder is None or self.emergency_model is None or self.triage_model is None:
            raise RuntimeError("Classical ML bundle is not fitted")
        matrix, _names = self.builder.transform(frame)
        probabilities = self.emergency_model.predict_proba(matrix)[:, 1]
        levels = self.triage_model.predict(matrix).astype(int)
        levels = np.where(probabilities >= self.emergency_threshold, np.minimum(levels, 2), levels)
        if self.department_model is None:
            departments = np.array([""] * len(frame))
        else:
            departments = self.department_model.predict(matrix)
        return probabilities.astype(float), levels.astype(int), departments


def fit_classical(
    train: pd.DataFrame,
    val: pd.DataFrame,
    *,
    seed: int,
    class_weight: float,
    max_features: int,
    ngram_min: int,
    ngram_max: int,
    min_df: int = 2,
    candidates: tuple[str, ...] = CANDIDATES,
) -> ClassicalBundle:
    """Fit and select models using train for fitting and val for choices only."""
    bundle = ClassicalBundle()
    builder = FeatureBuilder(max_features, ngram_min, ngram_max, min_df=min_df)
    builder.fit(train)
    x_train, _names = builder.transform(train)
    x_val, _ = builder.transform(val)
    y_em_train = train["emergency"].to_numpy().astype(int)
    y_em_val = val["emergency"].to_numpy().astype(int)
    y_level_train = train["triage_level"].to_numpy().astype(int)
    y_level_val = val["triage_level"].to_numpy().astype(int)
    y_dept_train = train["department"].astype(str).to_numpy()
    y_dept_val = val["department"].astype(str).to_numpy()

    emergency, emergency_name, threshold, emergency_report = _select_emergency(
        x_train, y_em_train, x_val, y_em_val, seed, class_weight, candidates
    )
    triage, triage_name, triage_report = _select_triage(
        x_train, y_level_train, x_val, y_level_val, seed, candidates
    )
    department, department_name, department_report = _select_department(
        x_train, y_dept_train, x_val, y_dept_val, seed, candidates
    )

    # Validation report after the emergency threshold is allowed to cap the level.
    val_probabilities = emergency.predict_proba(x_val)[:, 1]
    val_levels = triage.predict(x_val).astype(int)
    val_levels = np.where(val_probabilities >= threshold, np.minimum(val_levels, 2), val_levels)
    combined = level_emergency_cost(y_level_val, val_levels)
    # Also score the emergency head on its own labels.
    emergency_head = binary_cost(y_em_val, (val_probabilities >= threshold).astype(int))

    bundle.builder = builder
    bundle.emergency_model = emergency
    bundle.emergency_name = emergency_name
    bundle.emergency_threshold = threshold
    bundle.triage_model = triage
    bundle.triage_name = triage_name
    bundle.department_model = department
    bundle.department_name = department_name
    bundle.metadata = {
        "path": "Classical ML",
        "emergency_model": emergency_name,
        "emergency_threshold": threshold,
        "triage_model": triage_name,
        "department_model": department_name,
        "validation_emergency_head": _jsonable(emergency_head),
        "validation_combined_level_cost": _jsonable(combined),
        "emergency_candidates": emergency_report,
        "triage_candidates": triage_report,
        "department_candidates": department_report,
        "test_set_used": False,
        "features": {
            "tfidf": "char_wb",
            "ngram_range": [ngram_min, ngram_max],
            "max_features": max_features,
            "class_weight_emergency": class_weight,
        },
    }
    return bundle


def _select_emergency(
    x_train: np.ndarray,
    y_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    seed: int,
    class_weight: float,
    candidates: tuple[str, ...],
) -> tuple[Any, str, float, list[dict[str, Any]]]:
    best_model: Any = None
    best_name = ""
    best_threshold = 0.5
    best_key: tuple[float, float] | None = None
    report: list[dict[str, Any]] = []
    for name in candidates:
        model, calibration = _fit_binary(
            _binary_estimator(name, seed, class_weight), x_train, y_train
        )
        probabilities = model.predict_proba(x_val)[:, 1]
        threshold, stats = tune_threshold(y_val, probabilities)
        recall = stats["emergency_recall"]
        recall_value = -1.0 if recall is None else float(recall)
        key = (float(stats["cost"]), -recall_value)
        report.append({"name": name, "calibration": calibration, **_jsonable(stats)})
        if best_key is None or key < best_key:
            best_key = key
            best_model = model
            best_name = name
            best_threshold = threshold
    if best_model is None:
        raise RuntimeError("No Classical ML emergency candidate could be fit")
    return best_model, best_name, best_threshold, report


def _select_triage(
    x_train: np.ndarray,
    y_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    seed: int,
    candidates: tuple[str, ...],
) -> tuple[Any, str, list[dict[str, Any]]]:
    weights = np.where(y_train <= 2, 20.0, 1.0)
    best_model: Any = None
    best_name = ""
    best_cost: float | None = None
    report: list[dict[str, Any]] = []
    for name in candidates:
        model = _multiclass_estimator(name, seed)
        model.fit(x_train, y_train, sample_weight=weights)
        predictions = model.predict(x_val)
        stats = level_emergency_cost(y_val, predictions)
        report.append({"name": name, **_jsonable(stats)})
        cost = float(stats["cost"])
        if best_cost is None or cost < best_cost:
            best_cost = cost
            best_model = model
            best_name = name
    if best_model is None:
        raise RuntimeError("No Classical ML triage candidate could be fit")
    return best_model, best_name, report


def _select_department(
    x_train: np.ndarray,
    y_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    seed: int,
    candidates: tuple[str, ...],
) -> tuple[Any, str, list[dict[str, Any]]]:
    best_model: Any = None
    best_name = ""
    best_accuracy = -1.0
    report: list[dict[str, Any]] = []
    for name in candidates:
        model = _multiclass_estimator(name, seed)
        model.fit(x_train, y_train)
        predictions = model.predict(x_val)
        accuracy = float((predictions == y_val).mean()) if len(y_val) else 0.0
        report.append({"name": name, "validation_accuracy": accuracy})
        if accuracy > best_accuracy:
            best_accuracy = accuracy
            best_model = model
            best_name = name
    if best_model is None:
        raise RuntimeError("No Classical ML department candidate could be fit")
    return best_model, best_name, report


def _binary_estimator(name: str, seed: int, class_weight: float) -> Any:
    weight = {0: 1.0, 1: float(class_weight)}
    if name == "logistic_regression":
        return LogisticRegression(
            class_weight=weight, max_iter=400, random_state=seed, solver="lbfgs"
        )
    if name == "hist_gradient_boosting":
        return HistGradientBoostingClassifier(
            class_weight=weight,
            max_iter=60,
            learning_rate=0.1,
            random_state=seed,
            early_stopping=False,
        )
    raise ValueError(name)


def _multiclass_estimator(name: str, seed: int) -> Any:
    if name == "logistic_regression":
        return LogisticRegression(max_iter=400, random_state=seed, solver="lbfgs")
    if name == "hist_gradient_boosting":
        return HistGradientBoostingClassifier(
            max_iter=60, learning_rate=0.1, random_state=seed, early_stopping=False
        )
    raise ValueError(name)


def _fit_binary(estimator: Any, features: np.ndarray, labels: np.ndarray) -> tuple[Any, str]:
    """Sigmoid calibration on the training rows. Falls back if a fold is single-class."""
    try:
        calibrated = CalibratedClassifierCV(estimator, method="sigmoid", cv=3)
        calibrated.fit(features, labels)
    except ValueError:
        estimator.fit(features, labels)
        return estimator, "uncalibrated"
    return calibrated, "sigmoid_cv3"


def _jsonable(stats: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for key, value in stats.items():
        if isinstance(value, float):
            clean[key] = round(value, 4)
        elif value is None or isinstance(value, str | int | bool):
            clean[key] = value
        else:
            clean[key] = value
    return clean
