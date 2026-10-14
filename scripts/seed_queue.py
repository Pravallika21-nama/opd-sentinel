"""Seed the local queue with illustrative cases.

Seeded cases are examples for a demo. They are not clinical outcomes.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.db import init_db  # noqa: E402
from app.services.store import seed_demo_cases  # noqa: E402


def main() -> None:
    """Insert illustrative cases that are not already in the audit database."""
    init_db()
    added = seed_demo_cases()
    print(f"Seeded {added} illustrative cases. Example, not a real clinical outcome.")


if __name__ == "__main__":
    main()
