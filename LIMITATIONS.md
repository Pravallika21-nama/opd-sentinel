# Limitations

OPD Sentinel is a decision-support prototype. These limits stay in force.

- **Not clinically validated.** Nothing in this repository has been signed off for patient care. A nurse confirms or overrides every case.
- **Rules are placeholders.** Every Safety-Rule Layer threshold has `clinically_reviewed: false`. A clinician must review them before any clinical use.
- **Official data is absent.** There is no organiser intake file in the repo. `make data` writes a synthetic stand-in labelled `record_source=synthetic`. It is not a hospital extract.
- **MIMIC-IV-ED is not installed here.** The official source is https://physionet.org/content/mimic-iv-ed/. `python scripts/prepare_mimic_iv_ed.py` only inspects a local folder set by `OPD_MIMIC_ED_DIR`. It does not download the files. Temperature stays in the published Fahrenheit unit. No emergency label is created. Until a real evaluation is run, the research page keeps real-data results Pending. Synthetic proxy scores are not MIMIC-IV-ED validation.
- **Official evaluator is absent.** Scores from `make eval` are a local proxy (`under-triage weight 20`, `over-triage weight 1` in `config/settings.yaml`), marked `proxy, not official`.
- **Quantum ML is a simulator experiment.** It uses PennyLane `default.qubit` on a small class-weighted subsample. No speedup and no quantum advantage are claimed. The risk score is not a calibrated probability. Classical ML is the live workflow.
- **The nurse decides.** The tool cannot confirm its own suggestion.
- **Inputs are thin.** Vitals may be missing or mistyped. There are no labs, imaging, or ECG. Patients may under-report or over-report. Implausible values are flagged and are not silently corrected.
- **Language coverage is a fixed lexicon plus character n-grams.** English, Hindi (roman and Devanagari), Telugu (roman and script), and a small Tamil set are listed for red flags. That is not general translation or language identification. Dashboard Hindi and Telugu labels are drafts and are not clinically reviewed.
- **Fairness is not established.** Age and sex slices, when `make eval` writes them, are descriptive counts on the synthetic or benchmark test split. Small groups stay Pending. They do not establish fairness.
- **A suggested department or red flag is not a diagnosis.**
- **The queue simulation is not a measured clinic.** It uses a synthetic arrival log, a fixed service time, and the file's triage levels. Assumptions are printed next to the result.
- **Metrics that have not been computed are Pending.** Do not treat a missing cell as zero.
