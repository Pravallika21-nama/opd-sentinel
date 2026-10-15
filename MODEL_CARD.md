# Model card — OPD Sentinel

Decision support for a nurse who has about a minute per walk-in patient. The nurse confirms or overrides every suggestion, and a doctor makes the diagnosis. The tool does not diagnose and does not replace a doctor.

## Out of scope

Diagnosis, treatment or prescribing advice, and any decision that skips Nurse Review. The model output is never copied into the doctor's diagnosis or prescription fields.

## Data

See [DATASET.md](DATASET.md). The current artefacts were trained on the public KTAS dataset (Moon et al., PLOS ONE 2019, CC BY 4.0): 1,267 real, de-identified **emergency-department** records from Korea. Those records are not OPD data. When the official intake file is placed at `data/raw/intake.csv`, it takes priority. When neither is present, a labelled synthetic file is used.

Hidden labels (`triage_level`, `department`, `emergency`) and the triage nurse's reference level are never features. The test split is not used for training, threshold tuning, or model selection.

## Features

These are fitted on the training split only. The input schema and preprocessing are unchanged from the original project:

- Age and vitals, with missing and implausible indicators. In the feature matrix, implausible numbers are replaced by the training median and flagged. The stored raw entry is not rewritten.
- Sex flags, including Hindi and Telugu tokens.
- Comorbidity and medication flags from free text. These are empty for KTAS.
- Red-flag count from the lexicon.
- Character n-grams (`char_wb`, 2–4, at most 600 features) of the normalised complaint.

## Model

Classical ML is the only model. Quantum ML has been removed from the code, configuration, dependencies, and interface.

| Head | Selection | Current artefact |
| --- | --- | --- |
| Emergency (level 1–2) | Logistic regression and histogram gradient boosting are both fitted. The winner is the one with the lowest validation asymmetric cost. Probabilities are sigmoid-calibrated (3-fold) | Logistic regression, threshold 0.1 tuned on validation |
| Triage level 1–5 | Same candidates, same validation cost | Logistic regression |
| Department | Trained only when every training row has a department label and there are at least two classes | Not trained. KTAS has no department label |

Configured values in `config/settings.yaml`: seed 42; emergency class weight 20; under-triage of an emergency costs 20 and over-triage costs 1. Model version 0.2.0.

Validation split only (190 rows, 37 emergencies): emergency recall 0.9189, with 3 emergencies missed, 52 false alerts, and cost 112. These figures are not test results.

If the model file is missing or raises an error, `/triage` still stores the case. It marks `model_status` as `unavailable` or `error` and abstains ("Cannot assess, send to nurse now"). It never substitutes a fixed prediction.

## Safety-Rule Layer

The rules in `config/safety_rules.yaml` run after the model and can only keep or raise urgency. They cannot downgrade it. Every rule has `clinically_reviewed: false`. When input is too incomplete or implausible, the pipeline abstains, and an abstention counts as urgent.

## Results

These come from `make eval`, generated on 2026-10-15, on the KTAS **test** split: 191 records, 37 expert level 1–2 cases. The evaluation is a local proxy labelled `proxy, not official`. It is not a clinical validation. Report files are not committed, so a clean clone shows Pending until the command runs.

| Measure | Classical ML | Triage nurses (KTAS_RN, same rows) | Full system (rules + model) |
| --- | --- | --- | --- |
| Emergency recall | 0.9189 (95% CI 0.84–1.0) | 0.8649 | 0.9189 |
| Missed emergencies | 3 | 5 | 3 |
| False alerts | 65 | 3 | 69 |
| Emergency precision | 0.3434 | 0.9143 | 0.3301 |
| Triage-level accuracy | 0.466 | 0.8325 | 0.4555 |
| Asymmetric cost | 125 | 103 | 129 |

Per level, Classical ML recall was 0.0 for level 1 (2 cases), 0.9143 for level 2, 0.3333 for level 3, 0.4722 for level 4, and 0.0 for level 5 (13 cases; level 5 was never predicted). The pipeline abstained on 10 of 191 cases (rate 0.0524).

What this means:

- On the same records, the model misses slightly fewer emergencies than the triage nurses did. It does so by over-calling urgency, with about 20 times as many false alerts.
- Its level 1–5 agreement with experts is far below the nurses'. It sees only the intake form: no respiratory rate, mental status, pain score, or arrival mode. Treat the level as a prompt for nurse review, not an answer.
- The nurse column is a historical human reference. It is not a head-to-head trial.

Descriptive slices: emergency recall was 0.9231 for females (13 emergencies) and 0.9167 for males (24). For ages 18–64 it was 0.8947 (19 emergencies) and for 65+ it was 0.9444 (18). The under-18 group (4 records) stays Pending because it had fewer than 5 emergencies. These slices do not establish fairness.

On this machine, median inference was 4.79 ms for Classical ML and 6.56 ms for the full pipeline. That is not a clinical latency claim.

### External test: MIMIC-IV-ED Demo v2.2 (USA)

The same model file, without retraining or threshold changes, was scored on the open MIMIC-IV-ED Demo (`external_mimic_demo` section of `reports/results.json`). 222 stays, 207 with an ESI level, 115 of them ESI 1–2. The reference is the **triage nurse's ESI level**, so this measures agreement with a nurse, not accuracy against experts.

| Measure | Classical ML | Full system (rules + model) | Nurse ESI 1–2 |
| --- | --- | --- | --- |
| Recall for nurse ESI 1–2 | 0.8174 (95% CI 0.748–0.891) | 0.8522 (95% CI 0.781–0.922) | reference |
| Missed nurse-urgent stays | 21 | 17 | — |
| Extra urgent calls | 51 | 53 | — |
| Abstentions (counted as urgent) | — | 9 (0.0435) | — |
| Level agreement with ESI | 0.4638 | — | — |
| Sensitivity for hospital admission | 0.777 | 0.8129 | 0.6619 |
| Specificity for hospital admission | 0.4559 | 0.4412 | 0.6618 |

Recall dropped from 0.92 on KTAS to 0.82 here, which is the expected direction for a change of country, triage scale, and complaint wording (US abbreviations such as SOB against KTAS wording). Conditions and medications are absent in this dataset. The sample is small, so the intervals are wide.

## Limitations

See [LIMITATIONS.md](LIMITATIONS.md).
