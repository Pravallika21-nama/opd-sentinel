# Model card — OPD Sentinel

Status: **Pending**. No model has been trained. This card will be filled from `reports/results.md` after a real evaluation run. Do not invent figures here.

## Intended use

Decision support for a nurse who has about a minute per walk-in patient. The nurse confirms or overrides every suggestion. The tool does not diagnose and does not replace a doctor.

## Out of scope

Diagnosis, treatment advice, and any decision that skips Nurse Review.

## Data

Pending. Official intake data is not in this repository. A synthetic stand-in, if one is generated later, will be labelled synthetic.

Hidden labels (triage level, department, emergency flag) are not features.

## Models

| Path | Status | Role |
| --- | --- | --- |
| Classical ML | Pending (Phase 4) | Live workflow once trained |
| Quantum ML | Pending (Phase 5) | Experiment only |

Quantum ML, when it exists, will run on the PennyLane `default.qubit` simulator. No speedup and no accuracy advantage are claimed.

## Hyperparameters

Pending. They will be copied from the training metadata written next to the artefacts.

## Results

Pending. Emergency recall, missed emergencies, asymmetric cost, and latency will appear here only after `make eval` writes `reports/results.md`.

## Limitations

See [LIMITATIONS.md](LIMITATIONS.md).
