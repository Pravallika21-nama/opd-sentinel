"""Training entry point for Classical ML and Quantum ML.

`make train` calls this module. It fits on the train split and selects
thresholds on the validation split. It refuses to read the test split.
"""

from __future__ import annotations

import hashlib
import json
import sys
from typing import Any

import joblib

from core.config_loader import load_settings
from core.paths import repo_root
from ml.classical import fit_classical
from ml.dataset import load_split
from ml.predict import artifact_path, load_classical
from ml.quantum import fit_quantum

MODEL_VERSION = "0.1.0"


def _configure_stdio() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def _sha256(path: Any) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 16), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write(bundle: Any, artifact_key: str, meta_key: str) -> None:
    artifact = artifact_path(artifact_key)
    meta_path = artifact_path(meta_key)
    artifact.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, artifact)
    meta_path.write_text(json.dumps(bundle.metadata, indent=2), encoding="utf-8")
    print(f"Wrote {artifact.relative_to(repo_root())}")
    print(f"Wrote {meta_path.relative_to(repo_root())}")


def main() -> None:
    """Train Classical ML, then the Quantum ML experiment.

    `--quantum-only` keeps the saved Classical ML artefact and reuses its
    training-split medians.
    """
    _configure_stdio()
    settings = load_settings()
    seed = int(settings["random_seed"])
    train = load_split("train", allow_test=False)
    val = load_split("val", allow_test=False)
    train_path = repo_root() / settings["data"]["processed_dir"] / "train.csv"
    data_hash = _sha256(train_path)
    print("OPD Sentinel training")
    print(f"Train rows: {len(train)}. Validation rows: {len(val)}. Test split: not loaded.")
    if "--quantum-only" in sys.argv[1:]:
        existing = load_classical()
        if existing is None or existing.builder is None:
            raise RuntimeError("--quantum-only needs a trained Classical ML artefact")
        if existing.metadata.get("data_sha256") != data_hash:
            raise RuntimeError("Classical ML artefact was trained on a different train split")
        print("Classical ML: kept as saved (--quantum-only).")
        _train_quantum(train, val, existing.builder.medians, seed, settings, data_hash)
        return
    classical_cfg = settings["classical"]
    classical = fit_classical(
        train,
        val,
        seed=seed,
        class_weight=float(classical_cfg["emergency_class_weight"]),
        max_features=int(classical_cfg["tfidf_max_features"]),
        ngram_min=int(classical_cfg["tfidf_ngram_min"]),
        ngram_max=int(classical_cfg["tfidf_ngram_max"]),
    )
    classical.metadata.update(
        {
            "model_version": MODEL_VERSION,
            "seed": seed,
            "data_sha256": data_hash,
            "train_rows": int(len(train)),
            "val_rows": int(len(val)),
        }
    )
    _write(classical, "classical", "classical_meta")
    head = classical.metadata["validation_emergency_head"]
    combined = classical.metadata["validation_combined_level_cost"]
    print("Validation only (not the test set):")
    print(
        "  Classical ML emergency head: "
        f"recall={head['emergency_recall']}, "
        f"missed={head['missed_emergencies']}, "
        f"asymmetric cost={head['cost']}, "
        f"threshold={classical.emergency_threshold}"
    )
    print(
        "  Classical ML level after that threshold: "
        f"recall={combined['emergency_recall']}, "
        f"missed={combined['missed_emergencies']}, "
        f"asymmetric cost={combined['cost']}"
    )
    if classical.builder is None:
        raise RuntimeError("Classical ML feature builder is missing")
    _train_quantum(train, val, classical.builder.medians, seed, settings, data_hash)


def _train_quantum(
    train: Any,
    val: Any,
    medians: dict[str, float],
    seed: int,
    settings: dict[str, Any],
    data_hash: str,
) -> None:
    print("Quantum ML: simulator only (default.qubit). No speedup or advantage is assumed.")
    quantum = fit_quantum(
        train,
        val,
        medians=medians,
        seed=seed,
        config=settings["quantum"],
    )
    quantum.metadata.update(
        {
            "model_version": MODEL_VERSION,
            "seed": seed,
            "data_sha256": data_hash,
        }
    )
    _write(quantum, "quantum", "quantum_meta")
    q_stats = quantum.metadata["validation_at_threshold"]
    print(
        "  Quantum ML validation: "
        f"recall={q_stats.get('emergency_recall')}, "
        f"missed={q_stats.get('missed_emergencies')}, "
        f"asymmetric cost={q_stats.get('cost')}. "
        "These are validation figures, not test-set results."
    )
    print(f"Quantum ML features: {', '.join(quantum.feature_names)}")


if __name__ == "__main__":
    main()
