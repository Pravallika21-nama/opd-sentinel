"""Evaluation entry point.

Prefers an official `evaluate.py` when one is present and its contract is known.
Until then, this module writes a local proxy and labels every score
"proxy, not official". The test split is read here and nowhere in training.
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
from typing import Any

import numpy as np
import pandas as pd

from core.config_loader import load_settings
from core.paths import repo_root
from core.schemas import TriageDecision
from core.text import normalise_text
from eval.external import external_mimic_demo
from eval.metrics import (
    accuracy,
    binary_report,
    bootstrap_recall,
    calibration_table,
    level_confusion,
    per_level_report,
    subgroup_recall,
)
from eval.queue_sim import run_queue_sim
from eval.report import write_reports
from eval.robustness import robustness_table
from eval.runtime_bench import time_calls
from ml.classical import has_department_labels
from ml.dataset import iter_intakes, load_split
from ml.ktas import REFERENCE_NURSE_FIELD
from ml.predict import load_classical


def _configure_stdio() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def _official(settings: dict[str, Any]) -> dict[str, Any]:
    root = repo_root()
    for relative in settings["evaluation"]["official_candidates"]:
        path = root / str(relative)
        if not path.is_file():
            continue
        completed = subprocess.run(
            [sys.executable, str(path)],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        return {
            "present": True,
            "path": str(relative),
            "returncode": completed.returncode,
            "stdout_tail": completed.stdout[-2000:],
            "stderr_tail": completed.stderr[-1000:],
            "reason": (
                "An evaluate.py file was found and executed with no arguments because "
                "its official calling convention is not documented here. "
                "The tables in this report remain the local proxy."
            ),
        }
    return {
        "present": False,
        "reason": (
            "Official evaluate.py is not in this repository. "
            "Every score below is a local proxy, not an official score."
        ),
    }


def _age_band(value: Any) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "unknown"
    age = float(value)
    if age < 1:
        return "0-1"
    if age < 18:
        return "1-17"
    if age < 65:
        return "18-64"
    return "65+"


def _sex_group(value: Any) -> str:
    token = normalise_text(
        None if value is None or (isinstance(value, float) and math.isnan(value)) else str(value)
    )
    if token in {"m", "male", "man", "purush", "magadu", "aadami"}:
        return "male"
    if token in {"f", "female", "woman", "mahila", "stree", "stri", "aadadi"}:
        return "female"
    if token == "":
        return "missing"
    return "other"


def _section_from_binary(
    y_emergency: np.ndarray,
    urgent: np.ndarray,
    *,
    under: float,
    over: float,
    seed: int,
    samples: int,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    stats = binary_report(y_emergency, urgent.astype(int), under=under, over=over)
    stats["emergency_recall_ci95"] = bootstrap_recall(
        y_emergency, urgent.astype(bool), samples=samples, seed=seed
    )
    stats["n"] = int(len(y_emergency))
    stats["n_emergencies"] = int(np.asarray(y_emergency).sum())
    stats["status"] = "measured"
    if extra:
        stats.update(extra)
    return stats


def _score_classical(bundle: Any, frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    probabilities, levels, departments = bundle.predict_frame(frame)
    return probabilities, levels, departments


def _pipeline_decisions(frame: pd.DataFrame, classical: Any) -> list[TriageDecision]:
    from core.arbitration import arbitrate

    decisions: list[TriageDecision] = []
    for intake in iter_intakes(frame):
        view = None if classical is None else classical.predict_intake(intake)
        decisions.append(arbitrate(intake, view))
    return decisions


def _pipeline_urgent(decisions: list[TriageDecision]) -> np.ndarray:
    """Urgent if the issued level is 1 or 2, or the case is abstained to the nurse."""
    urgent: list[bool] = []
    for decision in decisions:
        level_urgent = decision.triage_level is not None and decision.triage_level <= 2
        urgent.append(level_urgent or decision.abstain)
    return np.asarray(urgent, dtype=bool)


def _abstention_block(decisions: list[TriageDecision], y_emergency: np.ndarray) -> dict[str, Any]:
    """Proxy definition of abstention appropriateness. Not an official metric."""
    abstain = np.asarray([decision.abstain for decision in decisions], dtype=bool)
    n_abstain = int(abstain.sum())
    emergencies_abstained = int((abstain & (y_emergency == 1)).sum())
    inappropriate = 0
    for decision, emergency in zip(decisions, y_emergency, strict=True):
        if not decision.abstain or int(emergency) == 1:
            continue
        classical_nonurgent = decision.classical is not None and decision.classical.level > 2
        if not decision.validation_issues and classical_nonurgent:
            inappropriate += 1
    appropriateness = None if n_abstain == 0 else round(1 - inappropriate / n_abstain, 4)
    return {
        "abstention_rate": round(n_abstain / len(decisions), 4) if len(decisions) else None,
        "n_abstain": n_abstain,
        "emergencies_abstained": emergencies_abstained,
        "inappropriate_abstentions": inappropriate,
        "abstention_appropriateness": appropriateness,
        "abstention_definition": (
            "An abstention is counted as inappropriate when the case is not an emergency, "
            "validation found no issue, and Classical ML already called it non-urgent. "
            "This definition is a local proxy."
        ),
    }


def _manifest(settings: dict[str, Any]) -> dict[str, Any]:
    path = repo_root() / settings["data"]["processed_dir"] / "manifest.json"
    if not path.is_file():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def _nurse_reference(
    test: pd.DataFrame,
    y_emergency: np.ndarray,
    y_level: np.ndarray,
    *,
    under: float,
    over: float,
    seed: int,
    samples: int,
) -> dict[str, Any]:
    """Score the triage nurse's original level against the expert label, when recorded."""
    if REFERENCE_NURSE_FIELD not in test.columns:
        return {
            "status": "Pending",
            "reason": "This dataset does not record the original triage nurse level.",
        }
    nurse = pd.to_numeric(test[REFERENCE_NURSE_FIELD], errors="coerce")
    mask = nurse.notna().to_numpy()
    if not mask.any():
        return {"status": "Pending", "reason": "No triage nurse level is recorded."}
    levels = nurse.to_numpy()[mask].astype(int)
    return _section_from_binary(
        y_emergency[mask],
        levels <= 2,
        under=under,
        over=over,
        seed=seed,
        samples=samples,
        extra={
            "triage_level_accuracy": accuracy(y_level[mask], levels),
            "confusion_matrix": level_confusion(y_level[mask], levels),
            "per_level": per_level_report(y_level[mask], levels),
            "note": (
                "The emergency nurse's recorded level on the same test rows, scored against "
                "the expert label. A human reference, not a model."
            ),
        },
    )


def main() -> None:
    """Score the held-out test split and write reports. Missing models stay Pending."""
    _configure_stdio()
    settings = load_settings()
    evaluation = settings["evaluation"]
    under = float(evaluation["undertriage_emergency_weight"])
    over = float(evaluation["overtriage_weight"])
    samples = int(evaluation["bootstrap_samples"])
    seed = int(settings["random_seed"])
    test = load_split("test", allow_test=True)
    intakes = iter_intakes(test)
    y_emergency = test["emergency"].to_numpy().astype(int)
    y_level = test["triage_level"].to_numpy().astype(int)
    department_labelled = has_department_labels(test)
    y_department = (
        test["department"].astype(str).to_numpy() if department_labelled else np.array([])
    )
    manifest = _manifest(settings)
    data_source = str(manifest.get("source_kind", "unknown"))
    classical = load_classical()
    sections: dict[str, Any] = {}

    if classical is None:
        sections["classical"] = {
            "status": "Pending",
            "reason": "Classical ML artefact is not available.",
        }
    else:
        probabilities, levels, departments = _score_classical(classical, test)
        urgent = levels <= 2
        level_pred = levels.astype(int)
        sections["classical"] = _section_from_binary(
            y_emergency,
            urgent,
            under=under,
            over=over,
            seed=seed,
            samples=samples,
            extra={
                "triage_level_accuracy": accuracy(y_level, level_pred),
                "confusion_matrix": level_confusion(y_level, level_pred),
                "per_level": per_level_report(y_level, level_pred),
                "department_accuracy": (
                    accuracy(y_department, departments.astype(str))
                    if department_labelled and classical.department_model is not None
                    else None
                ),
                "department_note": (
                    None
                    if department_labelled
                    else "The test data has no department label. Department accuracy is Pending."
                ),
                "calibration": calibration_table(y_emergency, probabilities),
                "score_kind": "calibrated emergency probability, threshold chosen on validation",
            },
        )
        print(
            "Classical ML test (proxy, not official): "
            f"recall={sections['classical']['emergency_recall']}, "
            f"missed={sections['classical']['missed_emergencies']}, "
            f"false_alerts={sections['classical']['false_alerts']}, "
            f"cost={sections['classical']['cost']}"
        )

    sections["nurse_reference"] = _nurse_reference(
        test, y_emergency, y_level, under=under, over=over, seed=seed + 5, samples=samples
    )

    if classical is None:
        sections["pipeline"] = {
            "status": "Pending",
            "reason": "Full pipeline score needs the Classical ML artefact.",
        }
    else:
        decisions = _pipeline_decisions(test, classical)
        pipeline_levels = np.asarray(
            [
                decision.triage_level if decision.triage_level is not None else -1
                for decision in decisions
            ]
        )
        comparable = pipeline_levels > 0
        sections["pipeline"] = _section_from_binary(
            y_emergency,
            _pipeline_urgent(decisions),
            under=under,
            over=over,
            seed=seed + 2,
            samples=samples,
            extra={
                "triage_level_accuracy": accuracy(y_level[comparable], pipeline_levels[comparable])
                if comparable.any()
                else None,
                "confusion_matrix": level_confusion(
                    y_level[comparable], pipeline_levels[comparable]
                ),
                "per_level": per_level_report(y_level[comparable], pipeline_levels[comparable]),
                **_abstention_block(decisions, y_emergency),
                "note": "Safety-Rule Layer plus Classical ML. Abstention counts as urgent.",
            },
        )
        print(
            "Pipeline test (proxy, not official): "
            f"recall={sections['pipeline']['emergency_recall']}, "
            f"missed={sections['pipeline']['missed_emergencies']}, "
            f"cost={sections['pipeline']['cost']}, "
            f"abstention_rate={sections['pipeline']['abstention_rate']}"
        )

    if classical is None:
        sections["runtime"] = {"status": "Pending", "reason": "No artefact to time."}
        sections["robustness"] = {"status": "Pending", "reason": "No artefact to perturb."}
        sections["fairness"] = {"status": "Pending", "reason": "No artefact to slice."}
    else:
        sections["runtime"] = {
            "status": "measured",
            "classical": time_calls(classical.predict_intake, intakes, 60),
            "pipeline": time_calls(
                lambda intake: _pipeline_decisions(pd.DataFrame([intake]), classical),
                intakes,
                15,
            ),
            "note": "Milliseconds per case on this machine. Not a clinical latency claim.",
        }
        sections["robustness"] = {
            "status": "measured",
            "classical": robustness_table(
                test,
                y_emergency,
                lambda frame: _score_classical(classical, frame)[1] <= 2,
                [0.0, 0.25, 0.5],
                under=under,
                over=over,
                seed=seed,
            ),
            "pipeline": robustness_table(
                test,
                y_emergency,
                lambda frame: _pipeline_urgent(_pipeline_decisions(frame, classical)),
                [0.0, 0.25, 0.5],
                under=under,
                over=over,
                seed=seed + 3,
            ),
            "note": (
                "Vitals are blanked or replaced after fitting. Models are not retrained. "
                "Proxy, not official."
            ),
        }
        urgent = _score_classical(classical, test)[1] <= 2
        sections["fairness"] = {
            "status": "measured",
            "by_sex": subgroup_recall(
                y_emergency, urgent, test["sex"].map(_sex_group).to_numpy(), minimum_positives=5
            ),
            "by_age": subgroup_recall(
                y_emergency,
                urgent,
                test["age"].map(_age_band).to_numpy(),
                minimum_positives=5,
            ),
            "note": (
                "Descriptive slices of Classical ML on this test split. "
                "They do not establish fairness. "
                "Groups with fewer than 5 emergencies are Pending."
            ),
        }

    sections["external_mimic_demo"] = external_mimic_demo(
        classical, under=under, over=over, seed=seed + 7, samples=samples
    )
    external = sections["external_mimic_demo"]
    if external.get("status") == "measured":
        print(
            "External MIMIC-IV-ED Demo (proxy, vs nurse ESI): "
            f"classical recall={external['classical']['emergency_recall']}, "
            f"pipeline recall={external['pipeline']['emergency_recall']}, "
            f"n={external['n_labelled']}"
        )

    arrivals = repo_root() / settings["data"]["arrivals_synthetic_path"]
    queue = settings["queue_sim"]
    sections["queue_sim"] = run_queue_sim(
        arrivals, int(queue["n_servers"]), float(queue["service_minutes"])
    )

    payload = {
        "evaluation_kind": "proxy, not official",
        "data_source": data_source,
        "dataset": manifest.get("dataset"),
        "label_mapping": manifest.get("label_mapping"),
        "split_counts": manifest.get("split_counts"),
        "disclaimer": (
            "Local proxy. Under-triage of a true emergency costs "
            f"{under:g} and over-triage costs {over:g}. "
            "Official evaluate.py was not used for these tables. "
            "Not clinically validated."
        ),
        "cost_definition": {
            "undertriage_emergency_weight": under,
            "overtriage_weight": over,
            "urgent_levels": [1, 2],
            "label": "proxy, not official",
        },
        "sections": sections,
        "official_evaluator": _official(settings),
    }
    json_path, md_path = write_reports(payload, settings)
    print(f"Wrote {json_path.relative_to(repo_root())}")
    print(f"Wrote {md_path.relative_to(repo_root())}")


if __name__ == "__main__":
    main()
