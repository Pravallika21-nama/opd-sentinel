"""Adapter for the open MIMIC-IV-ED Demo v2.2 (external test set only).

Sources:
    https://physionet.org/content/mimic-iv-ed-demo/2.2/ (ED tables)
    https://physionet.org/content/mimic-iv-demo/2.2/ (hosp/patients, for age)
Licence: Open Data Commons Open Database License v1.0 (ODbL), open access.

100 de-identified patients, 222 emergency-department stays at Beth Israel
Deaconess Medical Center, Boston. Dates are shifted per patient, so clock time
is not interpretable; durations within a stay are. The triage `acuity` field is
an ESI score assigned by the triage nurse (1 = most urgent). It is a human
reference, not an expert consensus label, and it is never a model input.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from core.constants import ID_FIELD, SOURCE_FIELD

DATASET_NAME = "MIMIC-IV-ED Demo v2.2 (Johnson et al., PhysioNet)"
RECORD_SOURCE = "mimic_iv_ed_demo"
SOURCE_URL = "https://physionet.org/content/mimic-iv-ed-demo/2.2/"
LICENCE = "Open Data Commons Open Database License v1.0 (ODbL)"
TABLES = ("triage", "edstays", "diagnosis", "patients")

LABEL_MAPPING = {
    "esi_acuity": "triage.acuity, the triage nurse's ESI level (1-5). Reference only.",
    "emergency": "1 when esi_acuity is 1 or 2. Missing acuity stays missing.",
    "admitted": "1 when edstays.disposition is ADMITTED. An outcome recorded after triage.",
    "age": "patients.anchor_age + (year of intime - anchor_year), as MIMIC documents.",
    "temperature_c": "triage.temperature is Fahrenheit in the published dictionary; "
    "converted with (F - 32) * 5 / 9.",
}

NOT_IN_DATASET = ("known_conditions", "medications", "department")


def read_tables(directory: Path) -> dict[str, pd.DataFrame]:
    """Read the four gzip CSV files. Raises when one is missing."""
    frames: dict[str, pd.DataFrame] = {}
    for name in TABLES:
        path = directory / f"{name}.csv.gz"
        if not path.is_file():
            raise FileNotFoundError(f"Missing {path.name} in {directory}.")
        frames[name] = pd.read_csv(path)
    return frames


def fahrenheit_to_celsius(values: pd.Series) -> pd.Series:
    """Unit conversion only. Implausible readings are left for validation to flag."""
    return ((pd.to_numeric(values, errors="coerce") - 32.0) * 5.0 / 9.0).round(1)


def mimic_demo_to_intake(frames: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Map the demo tables to the application's intake columns plus reference columns."""
    triage = frames["triage"]
    stays = frames["edstays"]
    patients = frames["patients"]
    merged = triage.merge(
        stays[
            [
                "subject_id",
                "stay_id",
                "intime",
                "outtime",
                "gender",
                "arrival_transport",
                "disposition",
            ]
        ],
        on=["subject_id", "stay_id"],
        how="left",
        validate="one_to_one",
    ).merge(
        patients[["subject_id", "anchor_age", "anchor_year"]],
        on="subject_id",
        how="left",
        validate="many_to_one",
    )
    intime = pd.to_datetime(merged["intime"], errors="coerce")
    outtime = pd.to_datetime(merged["outtime"], errors="coerce")

    out = pd.DataFrame()
    out[ID_FIELD] = [f"mimic-{int(stay)}" for stay in merged["stay_id"]]
    out["age"] = merged["anchor_age"] + (intime.dt.year - merged["anchor_year"])
    out["sex"] = merged["gender"].map({"F": "female", "M": "male"}).fillna("")
    out["systolic_bp"] = pd.to_numeric(merged["sbp"], errors="coerce")
    out["diastolic_bp"] = pd.to_numeric(merged["dbp"], errors="coerce")
    out["pulse"] = pd.to_numeric(merged["heartrate"], errors="coerce")
    out["temperature_c"] = fahrenheit_to_celsius(merged["temperature"])
    out["spo2"] = pd.to_numeric(merged["o2sat"], errors="coerce")
    out["complaint"] = merged["chiefcomplaint"].fillna("").astype(str).str.strip()
    out["known_conditions"] = ""
    out["medications"] = ""
    out[SOURCE_FIELD] = RECORD_SOURCE
    acuity = pd.to_numeric(merged["acuity"], errors="coerce")
    out["esi_acuity"] = acuity.where(acuity.between(1, 5), np.nan)
    out["emergency"] = np.where(out["esi_acuity"].isna(), np.nan, (out["esi_acuity"] <= 2) * 1.0)
    out["admitted"] = (merged["disposition"] == "ADMITTED").astype(int)
    out["disposition"] = merged["disposition"].fillna("UNKNOWN")
    out["arrival_transport"] = merged["arrival_transport"].fillna("UNKNOWN")
    out["length_of_stay_min"] = ((outtime - intime).dt.total_seconds() / 60.0).round(1)
    out["pain_reported"] = merged["pain"].astype(str)

    profile = {
        "stays": int(len(out)),
        "patients": int(merged["subject_id"].nunique()),
        "acuity_missing": int(out["esi_acuity"].isna().sum()),
        "acuity_counts": {
            str(level): int((out["esi_acuity"] == level).sum()) for level in range(1, 6)
        },
        "emergency_reference": int(np.nansum(out["emergency"])),
        "admitted": int(out["admitted"].sum()),
        "age_missing": int(out["age"].isna().sum()),
        "blank_vitals": {
            name: int(out[name].isna().sum())
            for name in ("systolic_bp", "diastolic_bp", "pulse", "temperature_c", "spo2")
        },
        "empty_complaints": int((out["complaint"] == "").sum()),
        "temperature_below_50f": int(
            (pd.to_numeric(merged["temperature"], errors="coerce") < 50).sum()
        ),
    }
    return out, profile
