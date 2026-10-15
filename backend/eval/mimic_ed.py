"""MIMIC-IV-ED intake check.

This module does not download PhysioNet files and does not read unofficial mirrors.
It inspects a directory the user has already been granted access to.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from core.config_loader import load_yaml
from core.paths import repo_root

SOURCE_URL = "https://physionet.org/content/mimic-iv-ed/"


def mapping_config() -> dict[str, Any]:
    """Public column contract. Confirmed against the files only when they are present."""
    return load_yaml("config/mimic_iv_ed.yaml")


def prepare_mimic_iv_ed(directory: Path) -> dict[str, Any]:
    """Inspect headers and write a provenance manifest. No labels are invented."""
    config = mapping_config()
    directory = directory.expanduser().resolve()
    if not directory.is_dir():
        raise FileNotFoundError(
            "MIMIC-IV-ED is not installed. Request credentialed access at "
            f"{SOURCE_URL} and set OPD_MIMIC_ED_DIR to the local folder. "
            "This command does not download the dataset."
        )
    tables: dict[str, Any] = {}
    for name, spec in config["tables"].items():
        path = directory / str(spec["file"])
        if not path.is_file():
            raise FileNotFoundError(f"Missing {spec['file']} in {directory}.")
        header = pd.read_csv(path, nrows=0)
        found = list(header.columns)
        required = [str(column) for column in spec["required"]]
        missing = [column for column in required if column not in found]
        if missing:
            raise ValueError(
                f"{spec['file']} is missing columns {missing}. Found columns: {found}."
            )
        chunks = pd.read_csv(path, usecols=required, chunksize=50_000)
        row_count = sum(len(chunk) for chunk in chunks)
        tables[name] = {
            "file": spec["file"],
            "columns_found": found,
            "rows": int(row_count),
        }
    manifest = {
        "source": "MIMIC-IV-ED",
        "source_url": SOURCE_URL,
        "licence": config["licence"],
        "local_dir_name": directory.name,
        "tables": tables,
        "field_map": config["field_map"],
        "temperature_unit_documented": config["temperature_unit_documented"],
        "temperature_conversion": "none",
        "emergency_label": ("Not a source column. No emergency label was created."),
        "triage_scale_note": config["triage_scale_note"],
        "evaluation_status": "Pending",
        "evaluation_reason": (
            "Files were inspected. A held-out OPD Sentinel evaluation on this "
            "source has not been run. Synthetic proxy scores are not this dataset."
        ),
    }
    destination = repo_root() / "data" / "processed" / "mimic_iv_ed_manifest.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    manifest["manifest_path"] = str(destination)
    return manifest
