"""Adapter for the public KTAS triage dataset (Moon et al., PLOS ONE 2019).

Source: S1 Appendix "EMR review coding data", https://doi.org/10.1371/journal.pone.0216972
Licence: Creative Commons Attribution (CC BY 4.0), as stated on the article.
Coding: S2 Appendix "EMR review coding guideline" from the same article.

The file holds 1,267 de-identified adult records from two Korean emergency
departments (Oct 2016 to Sep 2017). It is emergency-department data, not OPD
data. KTAS is a five-level scale where 1 is most urgent, the same direction
as this application, but KTAS levels are not clinically equivalent to the
application's levels. That difference is documented, not hidden.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from core.constants import ID_FIELD, SOURCE_FIELD

DATASET_NAME = "KTAS emergency triage records (Moon et al., PLOS ONE 2019)"
RECORD_SOURCE = "ktas_moon_2019"
DOI = "https://doi.org/10.1371/journal.pone.0216972"
LICENCE = "CC BY 4.0"
REFERENCE_NURSE_FIELD = "reference_triage_nurse_level"

# Coded fields from the S2 Appendix guideline.
_SEX_CODES = {1: "female", 2: "male"}

# Vital-sign columns. Unmeasurable entries are written in Korean in the source
# workbook and are kept as missing, never imputed here.
_VITALS = {
    "SBP": "systolic_bp",
    "DBP": "diastolic_bp",
    "HR": "pulse",
    "BT": "temperature_c",
    "Saturation": "spo2",
}

# Columns that exist in the workbook but are not used. Each has a reason.
UNUSED_COLUMNS: dict[str, str] = {
    "RR": "Respiratory rate is not collected by the application's intake form.",
    "Mental": "Mental status is not collected by the application's intake form.",
    "Pain": "Not collected by the intake form.",
    "NRS_pain": "Pain score is not collected by the intake form.",
    "Arrival mode": "Not collected by the intake form.",
    "Injury": "Not collected by the intake form.",
    "Group": "Site identifier, not a patient attribute.",
    "Patients number per hour": "Operational load, not a patient attribute.",
    "Diagnosis in ED": "Recorded after triage. Using it would leak the outcome.",
    "Disposition": "Recorded after triage. Using it would leak the outcome.",
    "Error_group": "Study annotation of mistriage. Outcome leakage.",
    "Length of stay_min": "Recorded after triage. Outcome leakage.",
    "KTAS duration_min": "Process timing, not a patient attribute.",
    "mistriage": "Study annotation derived from the labels. Outcome leakage.",
}

LABEL_MAPPING = {
    "triage_level": "KTAS_expert (1-5, expert consensus). Used as recorded, no remapping.",
    "emergency": "1 when KTAS_expert is 1 or 2, matching the application's urgent levels [1, 2].",
    "department": "Not available in this dataset. The department head is not trained.",
    REFERENCE_NURSE_FIELD: (
        "KTAS_RN, the triage nurse's original level. Evaluation reference only, never a feature."
    ),
}

REQUIRED_COLUMNS = ("Sex", "Age", "Chief_complain", "KTAS_RN", "KTAS_expert", *_VITALS)


def sha256_of(path: Path) -> str:
    """Hex digest of a file."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 16), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _numeric(series: pd.Series) -> tuple[pd.Series, int]:
    """Coerce to numbers. Non-numeric entries become missing and are counted."""
    values = pd.to_numeric(series, errors="coerce")
    blank = series.isna() | (series.astype(str).str.strip() == "")
    unmeasurable = int((values.isna() & ~blank).sum())
    return values, unmeasurable


def ktas_to_intake(frame: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Map the KTAS workbook to the application's logical intake columns.

    Returns the mapped frame and a profile of what was missing or unmeasurable.
    Rows whose expert level is not 1-5 are dropped and counted.
    """
    missing = [name for name in REQUIRED_COLUMNS if name not in frame.columns]
    if missing:
        raise KeyError(f"KTAS workbook is missing columns: {', '.join(missing)}")
    expert = pd.to_numeric(frame["KTAS_expert"], errors="coerce")
    valid = expert.between(1, 5)
    dropped = int((~valid).sum())
    source = frame.loc[valid].reset_index(drop=True)
    expert = expert.loc[valid].astype(int).reset_index(drop=True)

    out = pd.DataFrame()
    out[ID_FIELD] = [f"ktas-{index:04d}" for index in range(len(source))]
    out["age"] = pd.to_numeric(source["Age"], errors="coerce")
    sex_codes = pd.to_numeric(source["Sex"], errors="coerce")
    out["sex"] = sex_codes.map(lambda code: _SEX_CODES.get(int(code), "") if pd.notna(code) else "")
    profile: dict[str, Any] = {"unmeasurable": {}, "blank": {}}
    for column, logical in _VITALS.items():
        values, unmeasurable = _numeric(source[column])
        out[logical] = values
        profile["unmeasurable"][logical] = unmeasurable
        profile["blank"][logical] = int(values.isna().sum()) - unmeasurable
    out["complaint"] = source["Chief_complain"].fillna("").astype(str).str.strip()
    out["known_conditions"] = ""
    out["medications"] = ""
    out[SOURCE_FIELD] = RECORD_SOURCE
    out["triage_level"] = expert
    out["emergency"] = (expert <= 2).astype(int)
    out["department"] = ""
    nurse = pd.to_numeric(source["KTAS_RN"], errors="coerce")
    out[REFERENCE_NURSE_FIELD] = nurse.where(nurse.between(1, 5), np.nan)

    profile.update(
        {
            "rows_in_file": int(len(frame)),
            "rows_used": int(len(out)),
            "rows_dropped_invalid_label": dropped,
            "level_counts": {str(level): int((expert == level).sum()) for level in range(1, 6)},
            "emergency_count": int(out["emergency"].sum()),
            "non_latin_complaints": int(
                out["complaint"].str.contains(r"[^\x00-\x7f]", regex=True).sum()
            ),
            "empty_complaints": int((out["complaint"] == "").sum()),
        }
    )
    return out, profile


def read_workbook(path: Path) -> pd.DataFrame:
    """Read the first sheet of the published workbook."""
    return pd.read_excel(path, sheet_name=0)
