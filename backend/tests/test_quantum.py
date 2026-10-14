"""Quantum ML circuit checks. Simulator only. No advantage is claimed."""

import numpy as np

from ml.quantum import expectation_for_weights, quantum_kernel_matrix


def test_expectation_is_deterministic() -> None:
    weights = np.zeros((2, 4, 3))
    features = np.array([0.2, 0.4, 0.6, 0.8])
    first = expectation_for_weights(weights, features, data_reupload=False)
    second = expectation_for_weights(weights, features, data_reupload=False)
    assert first == second
    assert -1.0 <= first <= 1.0


def test_reupload_variant_returns_an_expectation() -> None:
    weights = np.zeros((2, 4, 3))
    features = np.linspace(0.1, 1.0, 4)
    value = expectation_for_weights(weights, features, data_reupload=True)
    assert -1.0 <= value <= 1.0


def test_optional_kernel_is_symmetric() -> None:
    features = np.array(
        [
            [0.1, 0.2, 0.3, 0.4],
            [0.5, 0.2, 0.1, 0.0],
            [1.0, 0.5, 0.2, 0.1],
        ]
    )
    kernel = quantum_kernel_matrix(features)
    assert kernel.shape == (3, 3)
    assert np.allclose(kernel, kernel.T)
    assert np.allclose(np.diag(kernel), 1.0)
