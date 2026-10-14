# Limitations

OPD Sentinel is a decision-support prototype. These limits apply now and stay in force as later phases land.

- **Not clinically validated.** Nothing in this repository has been signed off for patient care.
- **No measured performance yet.** Accuracy, emergency recall, cost, and latency are **Pending**. There is no result to cite.
- **Official data is absent.** There is no organiser intake file in the repo. A later synthetic file would be a stand-in, not a hospital extract, and must be labelled as synthetic.
- **Official evaluator is absent.** Until `evaluate.py` is provided, any local cost figure must be labelled as a proxy, not an official score.
- **Rules are not written yet.** When they are, every threshold is a placeholder with `clinically_reviewed: false` until a clinician reviews it.
- **Quantum ML is not implemented.** When it is, it will be a simulator experiment. It is not a claim of quantum advantage or a faster live path. Classical ML is the live workflow.
- **The nurse decides.** The tool cannot confirm its own suggestion. Nurse Review is mandatory.
- **Inputs are thin.** Vitals may be missing or mistyped. There are no labs, imaging, or ECG. Patients may under-report or over-report.
- **Language coverage is not established.** Complaint text may be multilingual or transliterated. Coverage of that language mix is unmeasured.
- **Fairness is not established.** No subgroup check by age or sex has been run.
- **A suggested department or red flag is not a diagnosis.**
