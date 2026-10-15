"""Prepare the public KTAS triage dataset for training and evaluation.

Usage:
    python scripts/prepare_ktas.py [--download]

`--download` fetches the published workbook from PLOS ONE when it is not
already in data/raw/ktas. The file's SHA-256 is checked against
config/settings.yaml before anything is written. Outputs stay in the
git-ignored data/raw folder. Run `make data` afterwards to build the splits.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from core.config_loader import load_settings  # noqa: E402
from core.paths import repo_root  # noqa: E402
from ml.ktas import (  # noqa: E402
    DATASET_NAME,
    DOI,
    LABEL_MAPPING,
    LICENCE,
    UNUSED_COLUMNS,
    ktas_to_intake,
    read_workbook,
    sha256_of,
)


def _configure_stdio() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def _download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "opd-sentinel-data-prep"})
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310
        target.write_bytes(response.read())


def main() -> int:
    _configure_stdio()
    config = load_settings()["data"]["ktas"]
    root = repo_root()
    workbook = root / config["workbook_path"]
    intake_path = root / config["intake_path"]
    if not workbook.is_file():
        if "--download" not in sys.argv[1:]:
            print(f"Workbook not found at {workbook}.")
            print("Run again with --download, or place the S1 Appendix file there by hand.")
            print(f"Source: {DOI}")
            return 1
        print(f"Downloading the S1 Appendix workbook from {config['url']}")
        _download(str(config["url"]), workbook)
    digest = sha256_of(workbook)
    expected = str(config["sha256"]).lower()
    if digest != expected:
        print(f"SHA-256 mismatch for {workbook}.")
        print(f"  expected {expected}")
        print(f"  found    {digest}")
        print("The file is not the version this adapter was checked against. Nothing written.")
        return 1
    frame, profile = ktas_to_intake(read_workbook(workbook))
    intake_path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(intake_path, index=False)
    sidecar = {
        "dataset": DATASET_NAME,
        "doi": DOI,
        "licence": LICENCE,
        "workbook_sha256": digest,
        "real_or_synthetic": "real, de-identified",
        "setting": "Two Korean emergency departments, adults over 15, Oct 2016 to Sep 2017",
        "label_mapping": LABEL_MAPPING,
        "unused_columns": UNUSED_COLUMNS,
        "not_in_dataset": ["known_conditions", "medications", "department"],
        "profile": profile,
    }
    intake_path.with_suffix(".json").write_text(json.dumps(sidecar, indent=2), encoding="utf-8")
    print(f"Wrote {intake_path.relative_to(root)} ({profile['rows_used']} rows)")
    print(f"Expert KTAS level counts: {profile['level_counts']}")
    print(f"Emergency (levels 1-2): {profile['emergency_count']}")
    print(f"Unmeasurable vitals kept as missing: {profile['unmeasurable']}")
    print(f"Blank vitals: {profile['blank']}")
    print("Next: make data, then make train and make eval.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
