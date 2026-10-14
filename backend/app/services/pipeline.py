"""Run one case through validation, both models, and the Safety-Rule Layer.

Quantum ML is attempted in parallel with a timeout. A timeout or error leaves
the case on Classical ML and records that Quantum ML is unavailable.
"""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout
from typing import Any

from core.arbitration import arbitrate
from core.config_loader import load_settings
from core.schemas import TriageDecision
from ml.predict import classical_view, quantum_available, quantum_view

_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="quantum-ml")
_QUANTUM_LOCK = threading.Lock()


def warm_models() -> None:
    """Load both artefacts once so the first request stays inside the Quantum ML timeout.

    PennyLane is imported on first use. Doing that during startup keeps the
    request path on the simulator without changing the timeout.
    """
    sample = {
        "age": 40,
        "sex": "female",
        "systolic_bp": 120,
        "diastolic_bp": 80,
        "pulse": 80,
        "temperature_c": 37.0,
        "spo2": 98,
        "complaint": "cough",
    }
    try:
        classical_view(sample)
        quantum_view(sample)
    except Exception:
        return


def run_triage(
    intake: dict[str, Any], *, illustrative: bool = False
) -> tuple[TriageDecision, float]:
    """Return the decision and the measured latency in milliseconds."""
    started = time.perf_counter()
    timeout = float(load_settings()["quantum"]["timeout_seconds"])
    classical_error: str | None = None
    try:
        classical = classical_view(intake)
    except Exception as exc:
        classical = None
        classical_error = f"Classical ML failed ({type(exc).__name__})."
    quantum, quantum_note = _quantum(intake, timeout)
    decision = arbitrate(
        intake,
        classical,
        quantum,
        quantum_note=quantum_note,
        illustrative=illustrative,
    )
    if classical_error and classical_error not in decision.abstain_reasons:
        decision.abstain = True
        decision.abstain_reasons.append(classical_error)
        decision.explanation.append(classical_error)
    latency_ms = (time.perf_counter() - started) * 1000
    return decision, latency_ms


def _quantum(intake: dict[str, Any], timeout: float) -> tuple[Any, str | None]:
    if not quantum_available():
        return None, "Quantum ML unavailable"
    if not _QUANTUM_LOCK.acquire(blocking=False):
        return None, "Quantum ML unavailable"
    try:
        future = _EXECUTOR.submit(quantum_view, intake)
        try:
            return future.result(timeout=timeout), None
        except FuturesTimeout:
            return None, "Quantum ML unavailable"
        except Exception:
            return None, "Quantum ML unavailable"
    finally:
        _QUANTUM_LOCK.release()
