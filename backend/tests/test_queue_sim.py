"""Priority queue versus first-come-first-served on a tiny synthetic log."""

from pathlib import Path

import pandas as pd

from eval.queue_sim import run_queue_sim


def test_priority_reduces_emergency_wait(tmp_path: Path) -> None:
    frame = pd.DataFrame(
        [
            {
                "case_id": "a",
                "arrival_minute": 0,
                "triage_level": 5,
                "emergency": 0,
                "record_source": "synthetic",
            },
            {
                "case_id": "b",
                "arrival_minute": 1,
                "triage_level": 4,
                "emergency": 0,
                "record_source": "synthetic",
            },
            {
                "case_id": "c",
                "arrival_minute": 2,
                "triage_level": 1,
                "emergency": 1,
                "record_source": "synthetic",
            },
        ]
    )
    path = tmp_path / "arrivals_synthetic.csv"
    frame.to_csv(path, index=False)
    result = run_queue_sim(path, n_servers=1, service_minutes=10)
    assert result["status"] == "measured"
    assert "synthetic" in " ".join(result["assumptions"])
    assert (
        result["priority"]["mean_wait_emergencies_minutes"]
        < result["first_come_first_served"]["mean_wait_emergencies_minutes"]
    )
