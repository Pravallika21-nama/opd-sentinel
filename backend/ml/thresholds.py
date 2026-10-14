"""Validation-split threshold tuning.

The held-out test split is not an input to these functions.
"""

from __future__ import annotations

import numpy as np


def binary_cost(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    *,
    under: float = 20.0,
    over: float = 1.0,
) -> dict[str, float | int | None]:
    """Asymmetric cost for a binary emergency decision.

    Under-triage (true emergency predicted non-emergency) uses `under`.
    Over-triage uses `over`. This is a local definition used for threshold
    choice and, when no official evaluator is present, for the labelled proxy.
    """
    truth = np.asarray(y_true).astype(int)
    pred = np.asarray(y_pred).astype(int)
    missed = int(((truth == 1) & (pred == 0)).sum())
    false_alerts = int(((truth == 0) & (pred == 1)).sum())
    caught = int(((truth == 1) & (pred == 1)).sum())
    positives = caught + missed
    recall = None if positives == 0 else caught / positives
    return {
        "missed_emergencies": missed,
        "false_alerts": false_alerts,
        "caught_emergencies": caught,
        "emergency_recall": recall,
        "cost": float(under) * missed + float(over) * false_alerts,
    }


def tune_threshold(
    y_true: np.ndarray,
    probabilities: np.ndarray,
    *,
    under: float = 20.0,
    over: float = 1.0,
) -> tuple[float, dict[str, float | int | None]]:
    """Pick a probability cutoff on validation scores by asymmetric cost.

    Ties prefer higher recall, then a lower threshold (more sensitive).
    """
    grid = np.linspace(0.05, 0.95, 19)
    best_threshold = 0.5
    best_key: tuple[float, float, float] | None = None
    best_stats: dict[str, float | int | None] = {}
    for threshold in grid:
        predictions = (np.asarray(probabilities) >= threshold).astype(int)
        stats = binary_cost(y_true, predictions, under=under, over=over)
        recall = stats["emergency_recall"]
        recall_value = -1.0 if recall is None else float(recall)
        key = (float(stats["cost"]), -recall_value, float(threshold))
        if best_key is None or key < best_key:
            best_key = key
            best_threshold = float(threshold)
            best_stats = stats
    best_stats = dict(best_stats)
    best_stats["threshold"] = best_threshold
    return best_threshold, best_stats


def level_emergency_cost(
    y_true_level: np.ndarray,
    y_pred_level: np.ndarray,
    *,
    under: float = 20.0,
    over: float = 1.0,
) -> dict[str, float | int | None]:
    """Score triage levels by whether they mark an emergency (levels 1 and 2)."""
    truth = (np.asarray(y_true_level).astype(int) <= 2).astype(int)
    pred = (np.asarray(y_pred_level).astype(int) <= 2).astype(int)
    return binary_cost(truth, pred, under=under, over=over)
