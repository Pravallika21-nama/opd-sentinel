# Model card — OPD Sentinel

Decision support for a nurse who has about a minute per walk-in patient. The nurse confirms or overrides every suggestion. The tool does not diagnose and does not replace a doctor.

## Out of scope

Diagnosis, treatment advice, and any decision that skips Nurse Review.

## Data

Official intake data is not in this repository. `make data` writes `data/synthetic/intake_synthetic.csv` with `record_source=synthetic` when `data/raw/intake.csv` is absent. The column map in `config/settings.yaml` is the schema adapter. Official headers are null until they are known. They are not guessed.

Hidden labels (`triage_level`, `department`, `emergency`) are not features. The test split is not used for training or threshold tuning.

The synthetic generator uses English, Hindi (roman and Devanagari), and Telugu (roman and script) complaint templates, about 4% emergencies, and injected noise (BP 0, temperature 96, a Fahrenheit-looking value, missing vitals).

## Features

Shared by both paths, fit on the training split only:

- Age and vitals, with missing and implausible indicators. Implausible numbers are replaced in the feature matrix by the training median and flagged. The stored raw entry is not rewritten.
- Sex flags, including Hindi and Telugu tokens.
- Comorbidity and medication flags from free text.
- Red-flag count from the lexicon.
- Character n-grams (`char_wb`, range from `config/settings.yaml`) of the normalised complaint. The original complaint is kept on the case.

Quantum ML then keeps 4 of the numeric vitals/age columns chosen by mutual information on the training split and scales them to `[0, pi]`. The chosen names are written into `backend/ml/artifacts/quantum_meta.json` by `make train`.

## Models

| Path | Role |
| --- | --- |
| Classical ML | Live workflow. Emergency classifier, triage level 1–5 classifier, and department classifier. Logistic regression and histogram gradient boosting are both fit. The emergency and triage heads are chosen by validation asymmetric cost, not accuracy. Emergency probabilities use sigmoid calibration when the folds allow it. The emergency threshold is tuned on the validation split. |
| Quantum ML | Experiment only. PennyLane `default.qubit`. `AngleEmbedding` plus 2 `StronglyEntanglingLayers`. PauliZ(0) expectation is mapped to a risk score. A data re-uploading circuit exists and is off unless `quantum.data_reupload` is true. An optional fidelity kernel is implemented and is not trained or used by the API. |

No speedup and no quantum advantage are claimed.

## Hyperparameters

These are the configured values in `config/settings.yaml`, not measured outcomes.

- Seed: 42
- Classical emergency class weight: 20
- TF-IDF character n-grams: 2–4, max 600 features
- Quantum simulator: `default.qubit`
- Quantum features: 4
- Quantum layers: 2
- Quantum data re-upload: false
- Quantum train subsample cap: 48 rows, at least 12 positives (the mix is not the population prevalence)
- Quantum epochs: 4, batch size 8, Adam step 0.2, early-stop patience 2
- Request timeout for Quantum ML: 0.75 seconds. On timeout the case continues on Classical ML and the UI shows "Quantum ML unavailable"

The fitted threshold, the selected model names, the mutual-information feature list, and the loss curve are written beside the artefacts by `make train`. Those files are not committed.

From the local artefacts for this synthetic run (`test_set_used` is false in both metadata files):

- Classical ML emergency head: histogram gradient boosting, validation threshold 0.25, validation emergency recall 0.9286, missed emergencies 1, asymmetric cost 23.
- Classical ML triage head: logistic regression. Department head: histogram gradient boosting.
- Quantum ML features chosen on the training split: pulse, temperature_c, diastolic_bp, spo2. Training stopped after 3 epochs. Validation threshold 0.7, validation emergency recall 0.0, missed emergencies 14, asymmetric cost 280. That validation figure is not a test-set result and is not an advantage claim.

## Results

Copied from the local `reports/results.md` written by `make eval` on 2026-10-14. The report files are not committed. A clean clone prints Pending on the Evaluation page until that command is run again. These figures are a local proxy on the synthetic test split (360 rows, 14 emergencies). They are not an official score and they are not a clinical claim.

| Path | Emergency recall | Missed emergencies | False alerts | Asymmetric cost |
| --- | --- | --- | --- | --- |
| Classical ML | 1 | 0 | 10 | 10 |
| Quantum ML (simulator) | 0 | 14 | 0 | 280 |
| Full pipeline | 1 | 0 | 19 | 19 |

Classical ML triage-level accuracy on that split was 0.8083 and department accuracy was 0.9556. The pipeline abstained on 1 of 360 cases (rate 0.0028); that case was not a labelled emergency. Inference on this machine: Classical ML p50 72.77 ms, Quantum ML p50 9.47 ms, pipeline p50 83.91 ms. Quantum ML did not catch the held-out emergencies in this run. No speedup and no quantum advantage are claimed. Fairness slices with fewer than 5 emergencies stay Pending and do not establish fairness. The queue simulation is labelled with its assumptions in the same report.

## Limitations

See [LIMITATIONS.md](LIMITATIONS.md).
