"""Load intake tables and write the seeded splits.

The column map in `config/settings.yaml` is the schema adapter. Null entries mean
the file already uses logical names. Official headers are not guessed.
Hidden labels stay on the table for evaluation and are not features.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import pandas as pd
from sklearn.model_selection import train_test_split

from core.config_loader import load_settings
from core.constants import ID_FIELD, INTAKE_FIELDS, LABEL_FIELDS, SOURCE_FIELD
from core.paths import repo_root


def settings_path(key: str) -> Path:
    """Resolve a path stored in the data or artifacts section of settings."""
    settings = load_settings()
    for section in ("data", "artifacts", "reports"):
        block = settings.get(section, {})
        if key in block:
            return repo_root() / str(block[key])
    raise KeyError(key)


def apply_column_map(frame: pd.DataFrame, column_map: dict[str, Any]) -> pd.DataFrame:
    """Rename official headers to logical fields.

    A null map entry means the logical name is already the header. A named
    entry that is absent raises, with instructions to edit the map. This
    function does not invent header names.
    """
    rename: dict[str, str] = {}
    for logical, header in column_map.items():
        if header is None or header == "":
            continue
        if header not in frame.columns:
            raise KeyError(
                f"Column {header!r} mapped to {logical} is not in the file. "
                "Set config/settings.yaml column_map to the official headers. "
                "Those headers were not guessed."
            )
        rename[str(header)] = str(logical)
    mapped = frame.rename(columns=rename).copy()
    required = list(INTAKE_FIELDS)
    missing = [name for name in required if name not in mapped.columns]
    if missing:
        raise KeyError(
            "Intake is missing logical fields: "
            + ", ".join(missing)
            + ". If this is the official file, fill column_map in config/settings.yaml."
        )
    for label in LABEL_FIELDS:
        if label not in mapped.columns:
            raise KeyError(f"Hidden label column {label} is missing from the intake file.")
    if ID_FIELD not in mapped.columns:
        mapped[ID_FIELD] = [f"row-{index:05d}" for index in range(len(mapped))]
    if SOURCE_FIELD not in mapped.columns:
        mapped[SOURCE_FIELD] = "unspecified"
    return mapped


def load_table(path: Path) -> pd.DataFrame:
    """Read a CSV and apply the configured column map."""
    frame = pd.read_csv(path)
    mapped = apply_column_map(frame, load_settings()["data"]["column_map"])
    mapped[LABEL_FIELDS[2]] = mapped["emergency"].astype(int)
    mapped["triage_level"] = mapped["triage_level"].astype(int)
    return mapped


def intake_from_mapping(record: dict[str, Any]) -> dict[str, Any]:
    """Copy intake fields. Label columns in `record` are ignored."""
    intake: dict[str, Any] = {}
    for key in INTAKE_FIELDS:
        value = record.get(key)
        if value is None or (isinstance(value, float) and math.isnan(value)):
            intake[key] = None
        elif isinstance(value, str) and value.strip() == "":
            intake[key] = (
                None
                if key != "complaint" and key not in {"known_conditions", "medications", "sex"}
                else value
            )
        else:
            intake[key] = value
    # Keep empty complaint as an empty string so abstention can see it.
    if intake.get("complaint") is None:
        intake["complaint"] = ""
    if intake.get("known_conditions") is None:
        intake["known_conditions"] = ""
    if intake.get("medications") is None:
        intake["medications"] = ""
    return intake


def iter_intakes(frame: pd.DataFrame) -> list[dict[str, Any]]:
    """Intake dicts for every row, without hidden labels."""
    records = frame.to_dict(orient="records")
    return [intake_from_mapping(record) for record in records]


def write_splits(
    frame: pd.DataFrame, processed_dir: Path, seed: int, fractions: dict[str, float]
) -> dict[str, int]:
    """Stratified train/validation/test split. IDs do not overlap.

    Stratification uses the emergency label only. The test file is written
    here and is not read by training.
    """
    if frame[ID_FIELD].duplicated().any():
        raise ValueError("case_id values must be unique before splitting")
    labels = frame["emergency"].astype(int)
    test_size = float(fractions["test"])
    val_fraction = float(fractions["val"])
    train_fraction = float(fractions["train"])
    rest, test = train_test_split(frame, test_size=test_size, random_state=seed, stratify=labels)
    relative_val = val_fraction / (train_fraction + val_fraction)
    train, val = train_test_split(
        rest,
        test_size=relative_val,
        random_state=seed,
        stratify=rest["emergency"].astype(int),
    )
    parts = {"train": train, "val": val, "test": test}
    ids = {name: set(part[ID_FIELD].astype(str)) for name, part in parts.items()}
    if ids["train"] & ids["val"] or ids["train"] & ids["test"] or ids["val"] & ids["test"]:
        raise RuntimeError("Split IDs overlap")
    processed_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    for name, part in parts.items():
        ordered = part.sort_values(ID_FIELD)
        ordered.to_csv(processed_dir / f"{name}.csv", index=False)
        counts[name] = int(len(ordered))
    return counts


def load_split(name: str, *, allow_test: bool = False) -> pd.DataFrame:
    """Load one processed split.

    Training and threshold tuning must leave `allow_test` false. Evaluation
    is the caller that sets it true.
    """
    if name not in {"train", "val", "test"}:
        raise ValueError(f"Unknown split: {name}")
    if name == "test" and not allow_test:
        raise RuntimeError(
            "The held-out test split cannot be used for training or threshold tuning."
        )
    path = repo_root() / load_settings()["data"]["processed_dir"] / f"{name}.csv"
    if not path.is_file():
        raise FileNotFoundError(f"Missing split {path}. Run make data first.")
    frame = pd.read_csv(path)
    frame["emergency"] = frame["emergency"].astype(int)
    frame["triage_level"] = frame["triage_level"].astype(int)
    return frame


def resolve_intake_source() -> tuple[Path, str]:
    """Prefer the official file when it exists. Otherwise use the synthetic file."""
    settings = load_settings()
    official = repo_root() / settings["data"]["official_path"]
    synthetic = repo_root() / settings["data"]["synthetic_path"]
    if official.is_file():
        return official, "official"
    if synthetic.is_file():
        return synthetic, "synthetic"
    raise FileNotFoundError(
        "No intake file found. Add the official file at data/raw/intake.csv "
        "or run make data to write the labelled synthetic file."
    )
