"""Degrade vitals on the held-out set and rescore. Models are not refit."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from eval.metrics import binary_report


def degrade(frame: pd.DataFrame, rate: float, seed: int) -> pd.DataFrame:
    """Randomly blank or replace critical vitals. Labels are unchanged."""
    rng = np.random.default_rng(seed)
    degraded = frame.copy()
    for column in ("systolic_bp", "pulse", "spo2", "temperature_c"):
        if column not in degraded.columns:
            continue
        mask = rng.random(len(degraded)) < rate
        values = degraded[column].to_numpy(copy=True)
        for index in np.flatnonzero(mask):
            if float(rng.random()) < 0.5:
                values[index] = np.nan
            else:
                values[index] = 0 if column != "temperature_c" else 96
        degraded[column] = values
    return degraded


def robustness_table(
    frame: pd.DataFrame,
    y_emergency: np.ndarray,
    score_fn: Any,
    rates: list[float],
    *,
    under: float,
    over: float,
    seed: int,
) -> list[dict[str, Any]]:
    """`score_fn` returns a boolean urgent-call array for a frame."""
    rows: list[dict[str, Any]] = []
    for offset, rate in enumerate(rates):
        scored = score_fn(degrade(frame, rate, seed + offset) if rate else frame)
        stats = binary_report(y_emergency, np.asarray(scored).astype(int), under=under, over=over)
        rows.append({"missing_or_invalid_rate": rate, **stats})
    return rows
