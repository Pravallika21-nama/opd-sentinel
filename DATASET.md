# Dataset

OPD Sentinel trains and evaluates on the first source that is present, in this order:

1. `data/raw/intake.csv`, the official organiser intake file. Not in this repository.
2. `data/raw/ktas/ktas_intake.csv`, the public KTAS dataset described below, prepared by `make ktas`.
3. `data/synthetic/intake_synthetic.csv`, a generated stand-in labelled `record_source=synthetic`.

`data/processed/manifest.json` records which source was used, its row count, split sizes, licence, and label mapping. The Evaluation page and `GET /system` read that file. Raw and processed data are git-ignored and are never committed.

## KTAS emergency triage records (current development dataset)

| Item | Value |
| --- | --- |
| Citation | Moon S-H, Shim JL, Park K-S, Park C-S. Triage accuracy and causes of mistriage using the Korean Triage and Acuity Scale. PLOS ONE 14(9): e0216972, 2019 |
| DOI | https://doi.org/10.1371/journal.pone.0216972 |
| File | S1 Appendix, `pone.0216972.s001.xlsx` |
| SHA-256 | `f631c951178799179d0fbd74fe979464b955ea1b426222bf015b163b8a24beb0`, checked by `scripts/prepare_ktas.py` |
| Licence | CC BY 4.0, from the article's copyright statement. Attribution is required |
| Setting | Two emergency departments in Korea, adults over 15, October 2016 to September 2017 |
| Records | 1,267, all used. No row was dropped for an invalid label |
| Real or synthetic | Real, de-identified |

This is **emergency-department** data, not outpatient (OPD) data. Expert KTAS levels are a published triage scale. They are not clinically equivalent to this application's levels 1 to 5, even though both run from 1 (most urgent) to 5.

### Field mapping

| Intake field | KTAS column | Notes |
| --- | --- | --- |
| `age` | Age | |
| `sex` | Sex | 1 = female, 2 = male, from the S2 coding guide |
| `systolic_bp`, `diastolic_bp`, `pulse`, `temperature_c`, `spo2` | SBP, DBP, HR, BT, Saturation | The value `측불` ("unmeasurable") becomes missing. SpO2 is blank in 688 rows |
| `complaint` | Chief_complain | Kept as recorded. 22 complaints contain non-Latin text |
| `known_conditions`, `medications` | None | Not in the dataset. Left empty |

### Labels

| Label | Rule |
| --- | --- |
| `triage_level` | `KTAS_expert`, the expert consensus level 1 to 5, used as recorded. No remapping |
| `emergency` | 1 when `KTAS_expert` is 1 or 2, matching the application's urgent levels |
| `department` | Not available. The department head is not trained, and the live system falls back to a keyword hint that the UI labels as a hint |
| `reference_triage_nurse_level` | `KTAS_RN`, the triage nurse's original level. Used only as a human reference in evaluation. Never a feature |

Expert level counts: level 1: 26, level 2: 220, level 3: 487, level 4: 459, level 5: 75. That gives 246 emergencies (19.4%).

### Columns not used

- **Not collected by the intake form:** RR, Mental, Pain, NRS_pain, Arrival mode, Injury.
- **Recorded after triage, so they would leak the outcome:** Diagnosis in ED, Disposition, Error_group, Length of stay, mistriage.
- **Not patient attributes:** Group (site), Patients number per hour (load), KTAS duration_min (process timing).

### Splits

Stratified 70 / 15 / 15 with seed 42: train 886, validation 190, test 191. The test split has 37 emergencies. Thresholds and model selection use the validation split only. `test_set_used` is `false` in the model metadata.

### Prepare it

```powershell
.\.venv\Scripts\python.exe scripts\prepare_ktas.py --download
.\.venv\Scripts\python.exe scripts\make_synthetic.py
.\.venv\Scripts\python.exe -m ml.train
.\.venv\Scripts\python.exe -m eval.evaluate
```

`prepare_ktas.py --download` fetches the workbook from the PLOS article, refuses it if the SHA-256 differs, and writes `data/raw/ktas/ktas_intake.csv` plus a JSON sidecar with the mapping and a field profile. Without `--download`, it reads a workbook you have already placed at `data/raw/ktas/pone.0216972.s001.xlsx`.

## Synthetic stand-in

`scripts/make_synthetic.py` always writes `data/synthetic/intake_synthetic.csv` and `data/synthetic/arrivals_synthetic.csv`. The rows are generated and are not patients. Complaints use English, Hindi, and Telugu templates, with injected noise such as a BP of 0 and Fahrenheit-looking temperatures. The arrival file drives the queue simulation in the evaluation report, and that section says it is synthetic.

## MIMIC-IV-ED Demo v2.2 (external test and insights)

- **Source:** Johnson A, et al. MIMIC-IV-ED Demo (version 2.2). PhysioNet. https://physionet.org/content/mimic-iv-ed-demo/2.2/
- **Licence:** Open Data Commons Open Database License v1.0 (ODbL). Open access; no credentials or data use agreement are needed for the demo. Keep the attribution, and share any adapted database under the same licence.
- **Setting:** Beth Israel Deaconess Medical Center emergency department, Boston, USA. 222 stays from 100 de-identified patients.
- **Use here:** external testing of the unchanged KTAS-trained model, and the Data Insights page. It is **not** used for training.

`prepare_mimic_demo.py --download` (or `make mimic-demo`) fetches `triage`, `edstays`, `diagnosis` (`ed/`) and `patients` (`hosp/`). It refuses any file whose SHA-256 differs from the value in `config/settings.yaml`, then writes `data/raw/mimic_ed_demo/mimic_demo_intake.csv` with a JSON profile. The adapter is `backend/ml/mimic_demo.py`.

| MIMIC field | Intake field | Note |
| --- | --- | --- |
| `anchor_age` + (stay year − `anchor_year`) | `age` | Dates are shifted per patient; only differences are meaningful |
| `gender` F/M | `sex` female/male | |
| `sbp`, `dbp`, `heartrate`, `o2sat` | `systolic_bp`, `diastolic_bp`, `pulse`, `spo2` | |
| `temperature` (°F) | `temperature_c` | Converted with (°F − 32) × 5/9. One reading is below 50 °F, which looks like Celsius already; it is flagged by validation, not altered |
| `chiefcomplaint` | `complaint` | Short US abbreviations |
| `acuity` (ESI 1–5) | `esi_acuity`; `emergency` = ESI 1–2 | 15 stays have no acuity and are excluded from scoring |
| `disposition` = ADMITTED | `admitted` | Secondary outcome |

Not in this dataset, so left blank: known conditions and medications. The reference label is the triage nurse's ESI level, not an expert re-review. Do not upload the raw tables or row-level derived files to a public repository; they stay under the git-ignored `data/raw/`.

## Full MIMIC-IV-ED (not used)

MIMIC-IV-ED (https://physionet.org/content/mimic-iv-ed/) needs credentialed PhysioNet access and a data use agreement. This repository does not download it and does not work around that access. After you have access, set `OPD_MIMIC_ED_DIR` to the local folder and run `python scripts/prepare_mimic_iv_ed.py`. That script checks the published column names and writes a manifest. It does not create an emergency label or convert Fahrenheit. MIMIC-IV-ED evaluation stays **Pending** until it is actually run. Do not upload MIMIC files or derived row-level data to any public repository.

## Demonstration records

The dashboard's illustrative cases and any records you type for a demo should be fictional. The API labels illustrative cases "Example, not a real patient".

## Patient self check-ins

Patient-portal check-ins are stored in the `patient_intakes` table. They are self-reported and never feed the model directly. The model only sees what the nurse registers after verifying the patient in person and measuring vitals. Self-reported duration, severity and allergies are copied into the nurse's notes, which are stored but are not model inputs.
