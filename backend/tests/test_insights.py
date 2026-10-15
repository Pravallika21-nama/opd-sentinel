"""Dataset insights are counted from the files, and missing files stay Pending."""

from pathlib import Path

import pandas as pd
import pytest

from app.services import insights


def _ktas_rows() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Group": [1, 1, 2, 2],
            "Sex": [1, 2, 1, 2],
            "Age": [25, 70, 45, 85],
            "Patients number per hour": [3, 3, 4, 4],
            "Arrival mode": [1, 2, 3, 4],
            "Injury": [1, 1, 2, 1],
            "Chief_complain": ["Dyspnea", "dyspnea ", "open wound", "mental change"],
            "Mental": [1, 1, 1, 4],
            "Pain": [0, 0, 1, 0],
            "NRS_pain": [None, None, 6, None],
            "SBP": ["120", "90", "130", "??"],
            "DBP": ["80", "60", "85", "??"],
            "HR": ["88", "120", "90", "40"],
            "RR": ["18", "28", "20", "8"],
            "BT": ["36.8", "38.5", "36.6", "35.0"],
            "Saturation": ["98", "88", "99", ""],
            "KTAS_RN": [4, 3, 4, 1],
            "Diagnosis in ED": ["Asthma", "Pneumonia", "Laceration", "Stroke"],
            "Disposition": [1, 2, 1, 3],
            "KTAS_expert": [4, 2, 5, 1],
            "Error_group": [0, 4, 2, 0],
            "Length of stay_min": [100.0, 600.0, 50.0, 300.0],
            "KTAS duration_min": [2.0, 3.0, 1.0, 5.0],
            "mistriage": [0, 2, 1, 0],
        }
    )


@pytest.fixture()
def fake_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(insights, "repo_root", lambda: tmp_path)
    insights._cached.cache_clear()
    return tmp_path


def test_missing_files_stay_pending(fake_root: Path) -> None:
    result = insights.dataset_insights()
    assert result["ktas"]["status"] == "Pending"
    assert result["mimic_demo"]["status"] == "Pending"


def test_ktas_counts_come_from_the_workbook(fake_root: Path) -> None:
    workbook = fake_root / "data" / "raw" / "ktas" / "pone.0216972.s001.xlsx"
    workbook.parent.mkdir(parents=True)
    _ktas_rows().to_excel(workbook, index=False)
    ktas = insights.dataset_insights()["ktas"]
    assert ktas["n"] == 4
    assert ktas["urgent"] == 2
    triage = ktas["nurse_vs_expert"]
    assert (triage["agree"], triage["under_triage"], triage["over_triage"]) == (2, 1, 1)
    assert triage["urgent_called_non_urgent"] == 1
    level_two = next(row for row in ktas["outcomes_by_level"] if row["level"] == 2)
    assert level_two["admitted"] == 1 and level_two["admitted_share"] == 1.0
    unresponsive = next(row for row in ktas["mental_status"] if row["label"] == "Unresponsive")
    assert unresponsive["urgent_share"] == 1.0
    dyspnea = next(row for row in ktas["top_complaints"] if row["label"] == "dyspnea")
    assert dyspnea["count"] == 2


def test_mimic_counts_come_from_the_prepared_file(fake_root: Path) -> None:
    folder = fake_root / "data" / "raw" / "mimic_ed_demo"
    folder.mkdir(parents=True)
    pd.DataFrame(
        {
            "age": [60, 70, 40],
            "complaint": ["SOB, CHEST PAIN", "Abd pain", "sob"],
            "esi_acuity": [2, 3, None],
            "admitted": [1, 0, 1],
            "disposition": ["ADMITTED", "HOME", "ADMITTED"],
            "arrival_transport": ["AMBULANCE", "WALK IN", "UNKNOWN"],
            "length_of_stay_min": [300.0, 120.0, 200.0],
        }
    ).to_csv(folder / "mimic_demo_intake.csv", index=False)
    pd.DataFrame(
        {
            "subject_id": [1],
            "stay_id": [1],
            "seq_num": [1],
            "icd_code": ["R079"],
            "icd_version": [10],
            "icd_title": ["CHEST PAIN, UNSPECIFIED"],
        }
    ).to_csv(folder / "diagnosis.csv.gz", index=False, compression="gzip")
    mimic = insights.dataset_insights()["mimic_demo"]
    assert (mimic["n"], mimic["labelled"], mimic["urgent"], mimic["admitted"]) == (3, 2, 1, 2)
    sob = next(row for row in mimic["top_complaints"] if row["label"] == "SOB")
    assert sob["count"] == 2 and sob["urgent"] == 1
    assert mimic["top_diagnoses"][0]["label"] == "Chest pain, unspecified"
