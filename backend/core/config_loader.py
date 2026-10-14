"""Load project YAML. Clinical thresholds in those files are unreviewed placeholders."""

from functools import lru_cache
from typing import Any

import yaml

from core.paths import repo_root


def load_yaml(relative: str) -> dict[str, Any]:
    """Read a YAML mapping from a path relative to the repository root."""
    path = repo_root() / relative
    if not path.is_file():
        raise FileNotFoundError(f"Missing config file: {path}")
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"{relative} must contain a YAML mapping")
    return data


@lru_cache(maxsize=1)
def load_settings() -> dict[str, Any]:
    """Return `config/settings.yaml`."""
    return load_yaml("config/settings.yaml")


@lru_cache(maxsize=1)
def load_validation_config() -> dict[str, Any]:
    """Return plausibility ranges. Thresholds are not clinically reviewed."""
    return load_yaml("config/validation_ranges.yaml")


@lru_cache(maxsize=1)
def load_safety_config() -> dict[str, Any]:
    """Return the Safety-Rule Layer declaration."""
    return load_yaml("config/safety_rules.yaml")


@lru_cache(maxsize=1)
def load_red_flag_config() -> dict[str, Any]:
    """Return the red-flag lexicon."""
    return load_yaml("config/red_flags.yaml")


@lru_cache(maxsize=1)
def load_department_config() -> dict[str, Any]:
    """Return keyword department hints used only when Classical ML is absent."""
    return load_yaml("config/departments.yaml")


@lru_cache(maxsize=1)
def load_demo_config() -> dict[str, Any]:
    """Return illustrative cases. They are not clinical outcomes."""
    return load_yaml("config/demo_cases.yaml")
