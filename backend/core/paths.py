"""Repository paths derived from this file, not from the process working directory."""

from pathlib import Path


def repo_root() -> Path:
    """Return the repository root (the directory that contains `backend` and `config`)."""
    return Path(__file__).resolve().parents[2]
