"""Training entry point for Classical ML.

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
from ml.predict import artifact_path

MODEL_VERSION = "0.2.0"


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


def _data_source(settings: dict[str, Any]) -> dict[str, Any]:
    manifest = repo_root() / settings["data"]["processed_dir"] / "manifest.json"
    if not manifest.is_file():
        return {"source_kind": "unknown"}
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    return {
        key: payload.get(key)
        for key in ("source_kind", "dataset", "licence", "label_mapping")
        if key in payload
    }


def main() -> None:
    """Train Classical ML and write the artefact and its metadata."""
    _configure_stdio()
    settings = load_settings()
    seed = int(settings["random_seed"])
    train = load_split("train", allow_test=False)
    val = load_split("val", allow_test=False)
    train_path = repo_root() / settings["data"]["processed_dir"] / "train.csv"
    data_hash = _sha256(train_path)
    source = _data_source(settings)
    print("OPD Sentinel training")
    print(f"Data source: {source.get('source_kind')}")
    print(f"Train rows: {len(train)}. Validation rows: {len(val)}. Test split: not loaded.")
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
            "data_source": source,
            "train_rows": int(len(train)),
            "val_rows": int(len(val)),
        }
    )
    _write(classical, "classical", "classical_meta")
    head = classical.metadata["validation_emergency_head"]
    combined = classical.metadata["validation_combined_level_cost"]
    print("Validation only (not the test set):")
    print(
        "  Emergency head: "
        f"recall={head['emergency_recall']}, "
        f"missed={head['missed_emergencies']}, "
        f"asymmetric cost={head['cost']}, "
        f"threshold={classical.emergency_threshold}"
    )
    print(
        "  Level after that threshold: "
        f"recall={combined['emergency_recall']}, "
        f"missed={combined['missed_emergencies']}, "
        f"asymmetric cost={combined['cost']}"
    )
    if classical.department_model is None:
        print("  Department head: not trained. The training data has no department label.")


if __name__ == "__main__":
    main()
