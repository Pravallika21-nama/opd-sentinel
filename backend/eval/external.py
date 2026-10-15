"""External test on the open MIMIC-IV-ED Demo.

The model was trained on Korean KTAS records. This scores it, unchanged, on
US emergency stays it has never seen. The reference is the triage nurse's ESI
level, so agreement here is agreement with a nurse, not with an expert panel.
Hospital admission is a second, outcome-based reference recorded after triage.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from core.config_loader import load_settings
from core.paths import repo_root
from eval.metrics import accuracy, binary_report, bootstrap_recall, level_confusion
from ml.dataset import iter_intakes
from ml.mimic_demo import DATASET_NAME, LICENCE, SOURCE_URL

CAVEATS = (
    "Different country, triage scale, and case mix than the KTAS training data.",
    "The ESI reference is the triage nurse's own level, not an expert re-review.",
    "Complaints are short US abbreviations (for example SOB, S/P FALL). "
    "The character n-grams were fitted on KTAS wording.",
    "Known conditions and medications are not in this dataset and stay blank.",
)


def _rate(hit: int, total: int) -> float | None:
    return None if total == 0 else round(hit / total, 4)


def _admission(urgent: np.ndarray, admitted: np.ndarray) -> dict[str, Any]:
    flagged = urgent.astype(bool)
    outcome = admitted.astype(bool)
    return {
        "n_admitted": int(outcome.sum()),
        "sensitivity": _rate(int((flagged & outcome).sum()), int(outcome.sum())),
        "specificity": _rate(int((~flagged & ~outcome).sum()), int((~outcome).sum())),
        "flagged_urgent": int(flagged.sum()),
    }


def _binary(
    y: np.ndarray, urgent: np.ndarray, *, under: float, over: float, seed: int, samples: int
) -> dict[str, Any]:
    stats: dict[str, Any] = dict(binary_report(y, urgent.astype(int), under=under, over=over))
    stats["emergency_recall_ci95"] = bootstrap_recall(
        y, urgent.astype(bool), samples=samples, seed=seed
    )
    return stats


def external_mimic_demo(
    classical: Any, *, under: float, over: float, seed: int, samples: int
) -> dict[str, Any]:
    """Score Classical ML and the full pipeline on the MIMIC-IV-ED Demo."""
    path = repo_root() / load_settings()["data"]["mimic_demo"]["intake_path"]
    if not path.is_file():
        return {
            "status": "Pending",
            "reason": "Run make mimic-demo to download and prepare the open demo tables.",
            "source_url": SOURCE_URL,
        }
    if classical is None:
        return {"status": "Pending", "reason": "Classical ML artefact is not available."}

    from core.arbitration import arbitrate

    frame = pd.read_csv(path)
    labelled = frame[frame["esi_acuity"].notna()].reset_index(drop=True)
    y = labelled["emergency"].astype(int).to_numpy()
    esi = labelled["esi_acuity"].astype(int).to_numpy()
    admitted = labelled["admitted"].astype(int).to_numpy()

    _probabilities, levels, _departments = classical.predict_frame(labelled)
    classical_urgent = levels <= 2
    classical_section = _binary(
        y, classical_urgent, under=under, over=over, seed=seed, samples=samples
    )
    classical_section.update(
        {
            "level_agreement_with_esi": accuracy(esi, levels),
            "confusion_matrix": level_confusion(esi, levels),
            "admission": _admission(classical_urgent, admitted),
        }
    )

    decisions = [
        arbitrate(intake, classical.predict_intake(intake)) for intake in iter_intakes(labelled)
    ]
    abstain = np.asarray([decision.abstain for decision in decisions], dtype=bool)
    issued = np.asarray(
        [
            decision.triage_level if decision.triage_level is not None else 9
            for decision in decisions
        ]
    )
    pipeline_urgent = abstain | (issued <= 2)
    pipeline_section = _binary(
        y, pipeline_urgent, under=under, over=over, seed=seed + 1, samples=samples
    )
    pipeline_section.update(
        {
            "n_abstain": int(abstain.sum()),
            "abstention_rate": _rate(int(abstain.sum()), len(abstain)),
            "admission": _admission(pipeline_urgent, admitted),
            "note": "Safety-Rule Layer plus Classical ML. Abstention counts as urgent.",
        }
    )

    return {
        "status": "measured",
        "evaluation_kind": "external, cross-dataset, proxy",
        "dataset": DATASET_NAME,
        "licence": LICENCE,
        "source_url": SOURCE_URL,
        "n_stays": int(len(frame)),
        "n_labelled": int(len(labelled)),
        "n_emergency_reference": int(y.sum()),
        "reference": "Triage nurse ESI level 1 or 2 counts as urgent.",
        "classical": classical_section,
        "pipeline": pipeline_section,
        "nurse_esi_admission": _admission(esi <= 2, admitted),
        "caveats": [
            f"Small sample: {len(labelled)} stays with a recorded ESI level. Intervals are wide.",
            *CAVEATS,
        ],
    }
