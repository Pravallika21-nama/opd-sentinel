"""Descriptive statistics computed from the real public datasets on disk.

Every number here is counted from the downloaded files at request time
(cached until a file changes). Nothing is typed in by hand. Code meanings
come from the KTAS S2 coding guideline and the MIMIC-IV-ED documentation.
"""

from __future__ import annotations

from collections import Counter
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from core.config_loader import load_settings
from core.paths import repo_root
from ml.ktas import DATASET_NAME as KTAS_NAME
from ml.ktas import DOI as KTAS_DOI
from ml.ktas import LICENCE as KTAS_LICENCE
from ml.mimic_demo import DATASET_NAME as MIMIC_NAME
from ml.mimic_demo import LICENCE as MIMIC_LICENCE
from ml.mimic_demo import SOURCE_URL as MIMIC_URL

# S2 Appendix coding guideline, Moon et al. 2019.
KTAS_ARRIVAL = {
    1: "Walking",
    2: "Public ambulance (119)",
    3: "Private car",
    4: "Private ambulance",
    5: "Public transport (police etc.)",
    6: "Wheelchair",
    7: "Other",
}
KTAS_DISPOSITION = {
    1: "Discharge",
    2: "Ward admission",
    3: "ICU admission",
    4: "Discharge against advice",
    5: "Transfer",
    6: "Death",
    7: "Operation from ED",
}
KTAS_MENTAL = {1: "Alert", 2: "Responds to voice", 3: "Responds to pain", 4: "Unresponsive"}
KTAS_ERROR_GROUP = {
    1: "Vital signs",
    2: "Physical exam",
    3: "Psychiatric",
    4: "Pain",
    5: "Mental status",
    6: "Underlying disease",
    7: "Records from another ED",
    8: "Onset",
    9: "Other",
}
_ADMITTED_KTAS = {2, 3, 7}
_AGE_BANDS = (
    (0, 18, "<18"),
    (18, 40, "18-39"),
    (40, 65, "40-64"),
    (65, 80, "65-79"),
    (80, 200, "80+"),
)
_TOP = 12


def _band(age: float) -> str:
    for low, high, name in _AGE_BANDS:
        if low <= age < high:
            return name
    return "unknown"


def _share(part: int, whole: int) -> float | None:
    return None if whole == 0 else round(part / whole, 4)


def _quartiles(values: pd.Series) -> dict[str, float | int | None]:
    clean = values.dropna()
    if clean.empty:
        return {"n": 0, "median": None, "q1": None, "q3": None}
    q1, median, q3 = np.quantile(clean.to_numpy(dtype=float), [0.25, 0.5, 0.75])
    return {
        "n": int(len(clean)),
        "median": round(float(median), 1),
        "q1": round(float(q1), 1),
        "q3": round(float(q3), 1),
    }


def _counts_with_urgency(
    labels: pd.Series, urgent: pd.Series, order: list[str] | None = None
) -> list[dict[str, Any]]:
    frame = pd.DataFrame({"label": labels.astype(str), "urgent": urgent.astype(bool)})
    grouped = frame.groupby("label")["urgent"].agg(["size", "sum"])
    names = (
        order if order is not None else grouped.sort_values("size", ascending=False).index.tolist()
    )
    rows = []
    for name in names:
        if name not in grouped.index:
            continue
        size = int(grouped.loc[name, "size"])
        hits = int(grouped.loc[name, "sum"])
        rows.append(
            {"label": name, "count": size, "urgent": hits, "urgent_share": _share(hits, size)}
        )
    return rows


def _levels(series: pd.Series) -> list[dict[str, int]]:
    return [{"level": level, "count": int((series == level).sum())} for level in range(1, 6)]


def _mtime(path: Path) -> float:
    return path.stat().st_mtime if path.is_file() else 0.0


# ---------------------------------------------------------------- KTAS


def _ktas(workbook: Path) -> dict[str, Any]:
    frame = pd.read_excel(workbook, sheet_name=0)
    expert = pd.to_numeric(frame["KTAS_expert"], errors="coerce")
    frame = frame.loc[expert.between(1, 5)].reset_index(drop=True)
    expert = pd.to_numeric(frame["KTAS_expert"], errors="coerce").astype(int)
    nurse = pd.to_numeric(frame["KTAS_RN"], errors="coerce")
    urgent = expert <= 2
    n = int(len(frame))

    valid_nurse = nurse.between(1, 5)
    under = int(((nurse > expert) & valid_nurse).sum())
    over = int(((nurse < expert) & valid_nurse).sum())
    agree = int(((nurse == expert) & valid_nurse).sum())
    missed_urgent = int((urgent & (nurse > 2) & valid_nurse).sum())
    error_groups = pd.to_numeric(frame["Error_group"], errors="coerce").fillna(0).astype(int)
    reasons = Counter(int(code) for code in error_groups if code in KTAS_ERROR_GROUP)

    disposition = pd.to_numeric(frame["Disposition"], errors="coerce")
    by_level = []
    los = pd.to_numeric(frame["Length of stay_min"], errors="coerce")
    for level in range(1, 6):
        mask = expert == level
        size = int(mask.sum())
        codes = disposition[mask]
        by_level.append(
            {
                "level": level,
                "count": size,
                "admitted": int(codes.isin(_ADMITTED_KTAS).sum()),
                "admitted_share": _share(int(codes.isin(_ADMITTED_KTAS).sum()), size),
                "died": int((codes == 6).sum()),
                "length_of_stay_min": _quartiles(los[mask & (los > 0)]),
            }
        )

    arrival = (
        pd.to_numeric(frame["Arrival mode"], errors="coerce").map(KTAS_ARRIVAL).fillna("Unknown")
    )
    mental = pd.to_numeric(frame["Mental"], errors="coerce").map(KTAS_MENTAL).fillna("Unknown")
    injury = (
        pd.to_numeric(frame["Injury"], errors="coerce")
        .map({1: "Not injury", 2: "Injury"})
        .fillna("Unknown")
    )
    ages = pd.to_numeric(frame["Age"], errors="coerce").map(
        lambda value: _band(value) if pd.notna(value) else "unknown"
    )
    complaints = frame["Chief_complain"].fillna("").astype(str).str.lower().str.strip()
    top_complaints = _counts_with_urgency(complaints[complaints != ""], urgent[complaints != ""])[
        :_TOP
    ]
    diagnoses = frame["Diagnosis in ED"].fillna("").astype(str).str.strip()
    top_diagnoses = [
        {"label": name, "count": int(count)}
        for name, count in diagnoses[diagnoses != ""].value_counts().head(10).items()
    ]
    pain = pd.to_numeric(frame["NRS_pain"], errors="coerce")
    vitals = {}
    for column, name in (
        ("HR", "pulse"),
        ("SBP", "systolic_bp"),
        ("RR", "resp_rate"),
        ("Saturation", "spo2"),
    ):
        values = pd.to_numeric(frame[column], errors="coerce")
        vitals[name] = [
            {"level": level, **_quartiles(values[expert == level])} for level in range(1, 6)
        ]
    pain_by_level = [{"level": level, **_quartiles(pain[expert == level])} for level in range(1, 6)]
    stay = los[los > 0]
    return {
        "status": "measured",
        "dataset": KTAS_NAME,
        "doi": KTAS_DOI,
        "licence": KTAS_LICENCE,
        "setting": "Two Korean emergency departments, adults, Oct 2016 to Sep 2017",
        "n": n,
        "urgent": int(urgent.sum()),
        "expert_levels": _levels(expert),
        "nurse_levels": _levels(nurse),
        "nurse_vs_expert": {
            "compared": int(valid_nurse.sum()),
            "agree": agree,
            "under_triage": under,
            "over_triage": over,
            "urgent_called_non_urgent": missed_urgent,
            "reasons": [
                {"label": KTAS_ERROR_GROUP[code], "count": count}
                for code, count in reasons.most_common()
            ],
        },
        "outcomes_by_level": by_level,
        "length_of_stay_overall": _quartiles(stay),
        "length_of_stay_over_7_days": int((stay > 7 * 24 * 60).sum()),
        "arrival_mode": _counts_with_urgency(arrival, urgent),
        "mental_status": _counts_with_urgency(mental, urgent, list(KTAS_MENTAL.values())),
        "injury": _counts_with_urgency(injury, urgent, ["Not injury", "Injury"]),
        "age_bands": _counts_with_urgency(ages, urgent, [band[2] for band in _AGE_BANDS]),
        "top_complaints": top_complaints,
        "top_diagnoses": top_diagnoses,
        "pain_by_level": pain_by_level,
        "vitals_by_level": vitals,
        "data_notes": [
            "The Pain column holds codes 0 and 1, but the guideline defines 1 and 2. "
            "It is not decoded; the numeric pain score (NRS) is used instead.",
            "Length of stay has extreme values. Medians and quartiles are shown, not means.",
            "Under-triage means the nurse's level was less urgent than the expert's.",
        ],
    }


# ---------------------------------------------------------------- MIMIC-IV-ED Demo


def _mimic(intake_path: Path, diagnosis_path: Path) -> dict[str, Any]:
    frame = pd.read_csv(intake_path)
    acuity = frame["esi_acuity"]
    labelled = acuity.notna()
    urgent = (acuity <= 2) & labelled
    by_acuity = []
    for level in range(1, 6):
        mask = acuity == level
        size = int(mask.sum())
        if size == 0:
            continue
        by_acuity.append(
            {
                "level": level,
                "count": size,
                "admitted": int(frame.loc[mask, "admitted"].sum()),
                "admitted_share": _share(int(frame.loc[mask, "admitted"].sum()), size),
                "length_of_stay_min": _quartiles(frame.loc[mask, "length_of_stay_min"]),
            }
        )
    complaints: Counter[str] = Counter()
    complaint_urgent: Counter[str] = Counter()
    for text, is_urgent in zip(frame["complaint"].fillna(""), urgent, strict=True):
        for part in {token.strip().upper() for token in str(text).split(",") if token.strip()}:
            complaints[part] += 1
            complaint_urgent[part] += int(bool(is_urgent))
    top_complaints = [
        {
            "label": name,
            "count": count,
            "urgent": complaint_urgent[name],
            "urgent_share": _share(complaint_urgent[name], count),
        }
        for name, count in complaints.most_common(_TOP)
    ]
    diagnosis = pd.read_csv(diagnosis_path)
    primary = diagnosis[diagnosis["seq_num"] == 1]["icd_title"].fillna("").astype(str).str.strip()
    top_diagnoses = [
        {"label": name.capitalize(), "count": int(count)}
        for name, count in primary[primary != ""].value_counts().head(10).items()
    ]
    ages = frame["age"].map(lambda value: _band(value) if pd.notna(value) else "unknown")
    return {
        "status": "measured",
        "dataset": MIMIC_NAME,
        "licence": MIMIC_LICENCE,
        "source_url": MIMIC_URL,
        "setting": "Beth Israel Deaconess Medical Center emergency department, Boston, USA",
        "n": int(len(frame)),
        "labelled": int(labelled.sum()),
        "urgent": int(urgent.sum()),
        "admitted": int(frame["admitted"].sum()),
        "acuity_levels": _levels(acuity),
        "outcomes_by_level": by_acuity,
        "length_of_stay_overall": _quartiles(frame["length_of_stay_min"]),
        "arrival_mode": _counts_with_urgency(frame["arrival_transport"].str.title(), urgent),
        "disposition": [
            {"label": str(name).title(), "count": int(count)}
            for name, count in frame["disposition"].value_counts().items()
        ],
        "age_bands": _counts_with_urgency(ages, urgent, [band[2] for band in _AGE_BANDS]),
        "top_complaints": top_complaints,
        "top_diagnoses": top_diagnoses,
        "data_notes": [
            "Dates are shifted per patient, so clock times are not analysed. Durations are.",
            "Acuity is the triage nurse's ESI level. Stays without one are excluded from "
            "urgency shares.",
            "Chief complaints are comma-separated abbreviations; each part is counted once "
            "per stay.",
        ],
    }


@lru_cache(maxsize=4)
def _cached(
    ktas_key: tuple[str, float], mimic_key: tuple[str, float, str, float]
) -> dict[str, Any]:
    ktas_path = Path(ktas_key[0])
    mimic_path, diagnosis_path = Path(mimic_key[0]), Path(mimic_key[2])
    ktas = (
        _ktas(ktas_path)
        if ktas_key[1]
        else {"status": "Pending", "reason": "Run make ktas to download the KTAS workbook."}
    )
    mimic = (
        _mimic(mimic_path, diagnosis_path)
        if mimic_key[1] and mimic_key[3]
        else {"status": "Pending", "reason": "Run make mimic-demo to download the open demo."}
    )
    return {"ktas": ktas, "mimic_demo": mimic}


def dataset_insights() -> dict[str, Any]:
    """Descriptive statistics for both public datasets. Missing files stay Pending."""
    data = load_settings()["data"]
    root = repo_root()
    ktas = root / data["ktas"]["workbook_path"]
    mimic = root / data["mimic_demo"]["intake_path"]
    diagnosis = root / data["mimic_demo"]["dir"] / "diagnosis.csv.gz"
    return _cached(
        (str(ktas), _mtime(ktas)),
        (str(mimic), _mtime(mimic), str(diagnosis), _mtime(diagnosis)),
    )
