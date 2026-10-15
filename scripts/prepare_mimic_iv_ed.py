"""Inspect a local MIMIC-IV-ED folder. Does not download it."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from eval.mimic_ed import prepare_mimic_iv_ed  # noqa: E402


def main() -> None:
    raw = os.environ.get("OPD_MIMIC_ED_DIR", "").strip()
    if not raw:
        print(
            "OPD_MIMIC_ED_DIR is empty. Request access at "
            "https://physionet.org/content/mimic-iv-ed/ and point this variable "
            "at the local folder. Nothing was downloaded."
        )
        raise SystemExit(2)
    try:
        manifest = prepare_mimic_iv_ed(Path(raw))
    except (FileNotFoundError, ValueError) as exc:
        print(exc)
        raise SystemExit(2) from exc
    print(f"Manifest written. Evaluation status: {manifest['evaluation_status']}.")
    print("Synthetic proxy results are not MIMIC-IV-ED validation.")


if __name__ == "__main__":
    main()
