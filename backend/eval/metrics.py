"""Held-out metrics. Callers pass test-set arrays. This module does not train."""

from __future__ import annotations

import numpy as np

from ml.thresholds import binary_cost


def rounded(value: float | None, digits: int = 4) -> float | None:
    """Round a measured rate. None stays None so the report can show Pending."""
    if value is None:
        return None
    return round(float(value), digits)


def emergency_calls(levels: np.ndarray, abstain: np.ndarray | None = None) -> np.ndarray:
    """Urgent when the level is 1 or 2. Abstention is handled by the caller."""
    return np.asarray(levels).astype(int) <= 2


def binary_report(
    y_emergency: np.ndarray,
    predicted_urgent: np.ndarray,
    *,
    under: float,
    over: float,
) -> dict[str, float | int | None]:
    """Proxy emergency counts. `predicted_urgent` is the decision being scored."""
    stats = binary_cost(y_emergency, predicted_urgent.astype(int), under=under, over=over)
    recall = stats["emergency_recall"]
    stats["emergency_recall"] = rounded(float(recall) if recall is not None else None)
    stats["cost"] = rounded(float(stats["cost"]), 1)
    return stats


def bootstrap_recall(
    y_emergency: np.ndarray,
    detected: np.ndarray,
    *,
    samples: int,
    seed: int,
) -> list[float] | None:
    """Percentile interval for emergency recall. None when there are too few resamples."""
    truth = np.asarray(y_emergency).astype(int)
    hit = np.asarray(detected).astype(bool)
    if int(truth.sum()) == 0:
        return None
    rng = np.random.default_rng(seed)
    scores: list[float] = []
    size = len(truth)
    for _ in range(samples):
        index = rng.integers(0, size, size)
        positives = truth[index] == 1
        if int(positives.sum()) == 0:
            continue
        scores.append(float(hit[index][positives].mean()))
    if len(scores) < 30:
        return None
    low, high = np.quantile(np.asarray(scores), [0.025, 0.975])
    return [round(float(low), 4), round(float(high), 4)]


def accuracy(y_true: np.ndarray, y_pred: np.ndarray) -> float | None:
    """Plain accuracy. Secondary to emergency recall."""
    if len(y_true) == 0:
        return None
    return round(float((np.asarray(y_true) == np.asarray(y_pred)).mean()), 4)


def calibration_table(
    y_emergency: np.ndarray, scores: np.ndarray, bins: int = 5
) -> list[dict[str, float | int]]:
    """Observed emergency rate against mean score in equal-width bins."""
    truth = np.asarray(y_emergency).astype(int)
    probability = np.asarray(scores).astype(float)
    edges = np.linspace(0.0, 1.0, bins + 1)
    rows: list[dict[str, float | int]] = []
    for index in range(bins):
        if index == bins - 1:
            mask = (probability >= edges[index]) & (probability <= edges[index + 1])
        else:
            mask = (probability >= edges[index]) & (probability < edges[index + 1])
        count = int(mask.sum())
        if count == 0:
            continue
        rows.append(
            {
                "bin_low": round(float(edges[index]), 2),
                "bin_high": round(float(edges[index + 1]), 2),
                "n": count,
                "mean_score": round(float(probability[mask].mean()), 4),
                "observed_rate": round(float(truth[mask].mean()), 4),
            }
        )
    return rows


def subgroup_recall(
    y_emergency: np.ndarray,
    detected: np.ndarray,
    groups: np.ndarray,
    *,
    minimum_positives: int = 5,
) -> list[dict[str, float | int | str | None]]:
    """Recall by group. Groups with fewer than `minimum_positives` emergencies stay Pending."""
    truth = np.asarray(y_emergency).astype(int)
    hit = np.asarray(detected).astype(bool)
    labels = np.asarray(groups).astype(str)
    rows: list[dict[str, float | int | str | None]] = []
    for name in sorted(set(labels.tolist())):
        mask = labels == name
        positives = int(truth[mask].sum())
        if positives < minimum_positives:
            rows.append(
                {
                    "group": name,
                    "n": int(mask.sum()),
                    "emergencies": positives,
                    "emergency_recall": None,
                    "status": "Pending",
                    "reason": f"Fewer than {minimum_positives} emergencies in this group.",
                }
            )
            continue
        caught = int(hit[mask][truth[mask] == 1].sum())
        rows.append(
            {
                "group": name,
                "n": int(mask.sum()),
                "emergencies": positives,
                "caught": caught,
                "missed_emergencies": positives - caught,
                "emergency_recall": round(caught / positives, 4),
                "status": "measured",
            }
        )
    return rows
