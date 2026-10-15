"""Prepare the open MIMIC-IV-ED Demo v2.2 as an external test set.

Usage:
    python scripts/prepare_mimic_demo.py [--download]

`--download` fetches the four tables from PhysioNet when they are missing.
Every file is checked against the SHA-256 PhysioNet publishes before anything
is written. Outputs stay in the git-ignored data/raw folder. This data is not
used for training.
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
from ml.ktas import sha256_of  # noqa: E402
from ml.mimic_demo import (  # noqa: E402
    DATASET_NAME,
    LABEL_MAPPING,
    LICENCE,
    NOT_IN_DATASET,
    SOURCE_URL,
    mimic_demo_to_intake,
    read_tables,
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
    config = load_settings()["data"]["mimic_demo"]
    root = repo_root()
    directory = root / config["dir"]
    digests: dict[str, str] = {}
    for name, spec in config["files"].items():
        path = directory / f"{name}.csv.gz"
        if not path.is_file():
            if "--download" not in sys.argv[1:]:
                print(f"{path.name} not found in {directory}. Run again with --download.")
                print(f"Source: {SOURCE_URL}")
                return 1
            print(f"Downloading {spec['url']}")
            _download(str(spec["url"]), path)
        digest = sha256_of(path)
        if digest != str(spec["sha256"]).lower():
            print(f"SHA-256 mismatch for {path.name}. Expected {spec['sha256']}, found {digest}.")
            print("The file is not the published version. Nothing written.")
            return 1
        digests[name] = digest
    frame, profile = mimic_demo_to_intake(read_tables(directory))
    intake_path = root / config["intake_path"]
    frame.to_csv(intake_path, index=False)
    sidecar = {
        "dataset": DATASET_NAME,
        "source_url": SOURCE_URL,
        "licence": LICENCE,
        "sha256": digests,
        "real_or_synthetic": "real, de-identified",
        "setting": "Beth Israel Deaconess Medical Center emergency department, Boston, USA",
        "use": "External test set and insights only. Not used for training.",
        "label_mapping": LABEL_MAPPING,
        "not_in_dataset": list(NOT_IN_DATASET),
        "profile": profile,
    }
    intake_path.with_suffix(".json").write_text(json.dumps(sidecar, indent=2), encoding="utf-8")
    print(f"Wrote {intake_path.relative_to(root)} ({profile['stays']} stays)")
    print(f"ESI acuity counts: {profile['acuity_counts']} (missing {profile['acuity_missing']})")
    print(f"Admitted: {profile['admitted']}")
    print("Next: make eval to score the trained model on this external set.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
