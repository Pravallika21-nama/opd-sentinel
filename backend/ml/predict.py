"""Load saved artefacts and score one case.

Classical ML is the live path. Quantum ML is optional and experimental.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib

from core.config_loader import load_settings
from core.paths import repo_root
from core.schemas import ModelView

_CACHE: dict[str, tuple[float, Any]] = {}


def artifact_path(key: str) -> Path:
    """Path of a saved model file from settings."""
    return repo_root() / str(load_settings()["artifacts"][key])


def classical_available() -> bool:
    """True when `make train` has written the Classical ML artefact."""
    return artifact_path("classical").is_file()


def quantum_available() -> bool:
    """True when `make train` has written the Quantum ML artefact."""
    return artifact_path("quantum").is_file()


def load_classical() -> Any | None:
    """Load the Classical ML bundle, or None when it has not been trained."""
    return _load("classical")


def load_quantum() -> Any | None:
    """Load the Quantum ML bundle, or None when it has not been trained."""
    return _load("quantum")


def classical_view(intake: dict[str, Any]) -> ModelView | None:
    """Score one case with Classical ML."""
    bundle = load_classical()
    if bundle is None:
        return None
    view: ModelView = bundle.predict_intake(intake)
    return view


def quantum_view(intake: dict[str, Any]) -> ModelView | None:
    """Score one case with Quantum ML. Caller handles timeout and errors."""
    bundle = load_quantum()
    if bundle is None:
        return None
    view: ModelView = bundle.predict_intake(intake)
    return view


def _load(key: str) -> Any | None:
    path = artifact_path(key)
    if not path.is_file():
        return None
    mtime = path.stat().st_mtime
    cached = _CACHE.get(key)
    if cached is not None and cached[0] == mtime:
        return cached[1]
    bundle = joblib.load(path)
    _CACHE[key] = (mtime, bundle)
    return bundle
