"""Inference latency on held-out rows. Figures are measured, not assumed."""

from __future__ import annotations

import time
from typing import Any

import numpy as np


def percentiles(samples: list[float]) -> dict[str, float | int | None]:
    """p50 and p95 in milliseconds."""
    if not samples:
        return {"n": 0, "p50_ms": None, "p95_ms": None}
    array = np.asarray(samples, dtype=float)
    return {
        "n": int(len(array)),
        "p50_ms": round(float(np.percentile(array, 50)), 2),
        "p95_ms": round(float(np.percentile(array, 95)), 2),
    }


def time_calls(fn: Any, intakes: list[dict[str, Any]], limit: int) -> dict[str, float | int | None]:
    """Time up to `limit` single-case calls."""
    samples: list[float] = []
    for intake in intakes[:limit]:
        started = time.perf_counter()
        fn(intake)
        samples.append((time.perf_counter() - started) * 1000)
    return percentiles(samples)
