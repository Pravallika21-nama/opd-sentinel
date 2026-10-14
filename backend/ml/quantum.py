"""Experimental Quantum ML path.

Runs on PennyLane's default.qubit simulator only. No speedup and no accuracy
advantage are claimed or assumed. If this path fails at request time, the case
continues on Classical ML.

The live workflow uses Classical ML. This module is a binary emergency-risk
experiment: AngleEmbedding plus StronglyEntanglingLayers, with the PauliZ(0)
expectation mapped to a risk score. A data re-uploading circuit is implemented
and left off unless `quantum.data_reupload` is true. The fidelity-kernel helper
is optional and is not called by training or by the API.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from core.constants import NUMERIC_FIELDS
from core.preprocessing import prepare_numeric
from core.schemas import ModelView
from core.validation import validate_intake
from ml.thresholds import tune_threshold


class QuantumBundle:
    """Simulator weights and the train-set scaling used at inference."""

    def __init__(self) -> None:
        self.feature_names: list[str] = []
        self.medians: dict[str, float] = {}
        self.mins: np.ndarray = np.array([])
        self.maxs: np.ndarray = np.array([])
        self.weights: np.ndarray = np.array([])
        self.threshold: float = 0.5
        self.data_reupload: bool = False
        self.metadata: dict[str, Any] = {}

    def scale_row(self, raw: np.ndarray) -> np.ndarray:
        """Scale selected features to [0, pi] with training min and max."""
        span = self.maxs - self.mins
        span = np.where(np.abs(span) < 1e-8, 1.0, span)
        unit = (raw - self.mins) / span
        return np.clip(unit, 0.0, 1.0) * np.pi

    def predict_intake(self, intake: dict[str, Any]) -> ModelView:
        """Risk score from the simulator. Not a calibrated probability."""
        prepared = prepare_numeric(validate_intake(intake), self.medians)
        raw = np.asarray([prepared[name] for name in self.feature_names], dtype=np.float64)
        risk = self.risk(self.scale_row(raw))
        level = 2 if risk >= self.threshold else 4
        return ModelView(level=level, p_emergency=risk, department=None)

    def risk(self, scaled: np.ndarray) -> float:
        """Map PauliZ expectation in [-1, 1] to a risk score in [0, 1]."""
        expval = expectation_for_weights(self.weights, scaled, data_reupload=self.data_reupload)
        return float(np.clip((1.0 - expval) / 2.0, 0.0, 1.0))

    def predict_scaled_matrix(self, scaled_rows: np.ndarray) -> np.ndarray:
        """Risk scores for a scaled matrix. Used by evaluation, not by training."""
        return np.asarray([self.risk(row) for row in scaled_rows], dtype=np.float64)


def expectation_for_weights(
    weights: np.ndarray, features: np.ndarray, *, data_reupload: bool = False
) -> float:
    """PauliZ(0) expectation. Same weights and features always return the same value."""
    circuit = _circuit(features.shape[0], data_reupload)
    return float(
        circuit(np.asarray(weights, dtype=np.float64), np.asarray(features, dtype=np.float64))
    )


def quantum_kernel_matrix(features: np.ndarray) -> np.ndarray:
    """Optional fidelity kernel on the simulator.

    Not used by `make train`, the API, or the evaluation report. No advantage
    is claimed for this variant.
    """
    import pennylane as qml

    rows = np.asarray(features, dtype=np.float64)
    n_wires = rows.shape[1]
    device = qml.device("default.qubit", wires=n_wires)

    @qml.qnode(device)
    def embed(features_row: np.ndarray) -> np.ndarray:
        qml.AngleEmbedding(features_row, wires=range(n_wires), rotation="Y")
        return qml.state()

    states = [np.asarray(embed(row), dtype=np.complex128) for row in rows]
    size = len(states)
    kernel = np.eye(size, dtype=np.float64)
    for i in range(size):
        for j in range(i + 1, size):
            value = float(np.abs(np.vdot(states[i], states[j])) ** 2)
            kernel[i, j] = value
            kernel[j, i] = value
    return kernel


def fit_quantum(
    train: pd.DataFrame,
    val: pd.DataFrame,
    *,
    medians: dict[str, float],
    continuous_train: np.ndarray,
    continuous_val: np.ndarray,
    seed: int,
    config: dict[str, Any],
) -> QuantumBundle:
    """Train a small simulator classifier. The test split is not passed in."""
    import pennylane as qml
    from pennylane import numpy as pnp
    from sklearn.feature_selection import mutual_info_classif

    y_train = train["emergency"].to_numpy().astype(int)
    y_val = val["emergency"].to_numpy().astype(int)
    n_features = int(config["n_features"])
    n_layers = int(config["n_layers"])
    data_reupload = bool(config["data_reupload"])
    mutual = mutual_info_classif(continuous_train, y_train, random_state=seed)
    chosen = np.argsort(mutual)[::-1][:n_features]
    feature_names = [NUMERIC_FIELDS[int(index)] for index in chosen]
    raw_train = continuous_train[:, chosen]
    raw_val = continuous_val[:, chosen]
    mins = raw_train.min(axis=0)
    maxs = raw_train.max(axis=0)

    def scale(raw: np.ndarray) -> np.ndarray:
        span = maxs - mins
        span = np.where(np.abs(span) < 1e-8, 1.0, span)
        unit = (raw - mins) / span
        return np.clip(unit, 0.0, 1.0) * np.pi

    x_train = scale(raw_train)
    x_val = scale(raw_val)
    x_fit, y_fit = _subsample(
        x_train,
        y_train,
        n_rows=int(config["max_train_rows"]),
        min_positive=int(config["min_positive_train"]),
        seed=seed,
    )
    x_watch, y_watch = _subsample(
        x_val,
        y_val,
        n_rows=int(config["max_val_rows"]),
        min_positive=max(4, int(config["min_positive_train"]) // 2),
        seed=seed + 1,
    )
    sample_weight = np.where(y_fit == 1, 20.0, 1.0).astype(np.float64)
    sample_weight = sample_weight / sample_weight.mean()

    rng = np.random.default_rng(seed)
    weights = pnp.array(rng.normal(0.0, 0.1, size=(n_layers, n_features, 3)), requires_grad=True)
    circuit = _circuit(n_features, data_reupload)
    optimiser = qml.AdamOptimizer(stepsize=float(config["stepsize"]))
    curve: list[dict[str, float]] = []
    best_weights = np.array(weights)
    best_cost = float("inf")
    waits = 0
    batch_size = int(config["batch_size"])
    epochs = int(config["epochs"])
    patience = int(config["patience"])

    for epoch in range(epochs):
        order = rng.permutation(len(x_fit))
        losses: list[float] = []
        for start in range(0, len(order), batch_size):
            batch = order[start : start + batch_size]
            xb = pnp.array(x_fit[batch], requires_grad=False)
            # Plain floats. PennyLane tensors with requires_grad=False cannot
            # multiply an autograd node (labels are constants, not parameters).
            labels = [float(value) for value in np.asarray(y_fit[batch]).tolist()]
            sw = [float(value) for value in np.asarray(sample_weight[batch]).tolist()]

            def cost(
                candidate: Any,
                xb: Any = xb,
                labels: tuple[float, ...] = tuple(labels),
                sw: tuple[float, ...] = tuple(sw),
            ) -> Any:
                total = 0.0
                for index in range(len(xb)):
                    expval = circuit(candidate, xb[index])
                    probability = qml.math.clip((1.0 - expval) / 2.0, 1e-6, 1.0 - 1e-6)
                    label = labels[index]
                    bce = -(
                        label * qml.math.log(probability)
                        + (1.0 - label) * qml.math.log(1.0 - probability)
                    )
                    total = total + sw[index] * bce
                return total / len(xb)

            weights, loss_value = optimiser.step_and_cost(cost, weights)
            losses.append(float(loss_value))
        watch_cost = _proxy_cost(circuit, np.array(weights), x_watch, y_watch)
        curve.append(
            {
                "epoch": float(epoch),
                "mean_batch_bce": float(np.mean(losses)) if losses else 0.0,
                "val_subsample_cost": watch_cost,
            }
        )
        print(
            f"Quantum ML epoch {epoch + 1}/{epochs}: "
            f"batch BCE {curve[-1]['mean_batch_bce']:.4f}, "
            f"validation-subsample cost {watch_cost:.1f}"
        )
        if watch_cost + 1e-6 < best_cost:
            best_cost = watch_cost
            best_weights = np.array(weights, dtype=np.float64)
            waits = 0
        else:
            waits += 1
            if waits >= patience:
                print("Quantum ML early stop on the validation subsample.")
                break

    bundle = QuantumBundle()
    bundle.feature_names = feature_names
    bundle.medians = dict(medians)
    bundle.mins = np.asarray(mins, dtype=np.float64)
    bundle.maxs = np.asarray(maxs, dtype=np.float64)
    bundle.weights = best_weights
    bundle.data_reupload = data_reupload
    val_risk = np.asarray(
        [
            float(np.clip((1.0 - _expval(circuit, best_weights, row)) / 2.0, 0.0, 1.0))
            for row in x_val
        ]
    )
    threshold, stats = tune_threshold(y_val, val_risk)
    bundle.threshold = threshold
    bundle.metadata = {
        "path": "Quantum ML",
        "simulator": "default.qubit",
        "claim": "Simulator only. No speedup claimed. No quantum advantage assumed.",
        "n_layers": n_layers,
        "n_features": n_features,
        "features": feature_names,
        "feature_mutual_information": {
            feature_names[index]: round(float(mutual[int(chosen[index])]), 6)
            for index in range(len(feature_names))
        },
        "data_reupload": data_reupload,
        "kernel_variant_trained": False,
        "train_subsample_rows": int(len(x_fit)),
        "train_subsample_positives": int(y_fit.sum()),
        "val_subsample_rows": int(len(x_watch)),
        "epochs_ran": len(curve),
        "loss_curve": curve,
        "threshold": threshold,
        "threshold_tuned_on": "validation",
        "validation_at_threshold": {
            key: (round(value, 4) if isinstance(value, float) else value)
            for key, value in stats.items()
        },
        "seed": seed,
        "test_set_used": False,
    }
    return bundle


_CIRCUITS: dict[tuple[int, bool], Any] = {}


def _circuit(n_wires: int, data_reupload: bool) -> Any:
    """Build the simulator circuit once per shape. Same inputs stay deterministic."""
    import pennylane as qml

    key = (n_wires, data_reupload)
    cached = _CIRCUITS.get(key)
    if cached is not None:
        return cached
    device = qml.device("default.qubit", wires=n_wires)

    @qml.qnode(device, interface="autograd")
    def circuit(weights: np.ndarray, features: np.ndarray) -> Any:
        wires = list(range(n_wires))
        if data_reupload:
            for layer in range(int(weights.shape[0])):
                qml.AngleEmbedding(features, wires=wires, rotation="Y")
                qml.StronglyEntanglingLayers(weights[layer : layer + 1], wires=wires)
        else:
            qml.AngleEmbedding(features, wires=wires, rotation="Y")
            qml.StronglyEntanglingLayers(weights, wires=wires)
        return qml.expval(qml.PauliZ(0))

    return circuit


def _expval(circuit: Any, weights: np.ndarray, features: np.ndarray) -> float:
    return float(
        circuit(np.asarray(weights, dtype=np.float64), np.asarray(features, dtype=np.float64))
    )


def _proxy_cost(
    circuit: Any, weights: np.ndarray, features: np.ndarray, labels: np.ndarray
) -> float:
    """20x under-triage plus 1x over-triage at a fixed 0.5 cutoff. Validation only."""
    if len(labels) == 0:
        return 0.0
    risks = np.asarray(
        [float(np.clip((1.0 - _expval(circuit, weights, row)) / 2.0, 0.0, 1.0)) for row in features]
    )
    predicted = risks >= 0.5
    missed = int(((labels == 1) & ~predicted).sum())
    false_alerts = int(((labels == 0) & predicted).sum())
    return 20.0 * missed + 1.0 * false_alerts


def _subsample(
    features: np.ndarray, labels: np.ndarray, *, n_rows: int, min_positive: int, seed: int
) -> tuple[np.ndarray, np.ndarray]:
    """Class-weighted subsample. The training mix is not the population prevalence."""
    rng = np.random.default_rng(seed)
    labels = np.asarray(labels).astype(int)
    positive = np.flatnonzero(labels == 1)
    negative = np.flatnonzero(labels == 0)
    n_pos = min(len(positive), max(1, min_positive))
    n_neg = min(len(negative), max(1, n_rows - n_pos))
    take = np.concatenate(
        [
            rng.choice(positive, size=n_pos, replace=False),
            rng.choice(negative, size=n_neg, replace=False),
        ]
    )
    rng.shuffle(take)
    return features[take], labels[take]
