"""MIMIC-IV-ED prepare inspects local files and does not invent an evaluation."""

import json
from pathlib import Path

import pandas as pd
import pytest

from eval.mimic_ed import prepare_mimic_iv_ed


def test_missing_directory_is_refused(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="does not download"):
        prepare_mimic_iv_ed(tmp_path / "absent")


def test_header_mismatch_is_reported(tmp_path: Path) -> None:
    folder = tmp_path / "mimic"
    folder.mkdir()
    pd.DataFrame({"stay_id": [1]}).to_csv(folder / "triage.csv", index=False)
    pd.DataFrame({"stay_id": [1], "intime": ["2020-01-01"], "gender": ["F"]}).to_csv(
        folder / "edstays.csv", index=False
    )
    with pytest.raises(ValueError, match="missing columns"):
        prepare_mimic_iv_ed(folder)


def test_matching_headers_write_a_pending_manifest(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    folder = tmp_path / "mimic"
    folder.mkdir()
    pd.DataFrame(
        {
            "stay_id": [1],
            "temperature": [98.6],
            "heartrate": [80],
            "o2sat": [97],
            "sbp": [120],
            "dbp": [80],
            "acuity": [3],
            "chiefcomplaint": ["cough"],
        }
    ).to_csv(folder / "triage.csv", index=False)
    pd.DataFrame({"stay_id": [1], "intime": ["2020-01-01"], "gender": ["F"]}).to_csv(
        folder / "edstays.csv", index=False
    )
    monkeypatch.setattr("eval.mimic_ed.repo_root", lambda: tmp_path)
    manifest = prepare_mimic_iv_ed(folder)
    assert manifest["evaluation_status"] == "Pending"
    assert manifest["temperature_conversion"] == "none"
    assert "No emergency label" in str(manifest["emergency_label"])
    written_path = tmp_path / "data" / "processed" / "mimic_iv_ed_manifest.json"
    written = json.loads(written_path.read_text(encoding="utf-8"))
    assert written["tables"]["triage"]["rows"] == 1
