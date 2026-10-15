# Limitations

OPD Sentinel is a decision-support prototype. These limits stay in force.

- **Not clinically validated.** Nothing in this repository has been signed off for patient care. A nurse confirms or overrides every case, and a doctor makes every diagnosis and prescription.
- **Rules are placeholders.** Every Safety-Rule Layer threshold has `clinically_reviewed: false`. A clinician must review them before any clinical use.
- **The development data is emergency-department data, not OPD data.** The KTAS records (see [DATASET.md](DATASET.md)) come from two Korean emergency departments. Their expert levels are not clinically equivalent to this application's levels, and their case mix differs from an Indian government OPD. The dataset has no department label, so department suggestions come from a keyword hint and are labelled as one.
- **The model is weak at levels 1–5.** On the KTAS test split, Classical ML matched the expert level 46.6% of the time; the triage nurses matched 83.3%. It catches most emergencies by over-calling urgency (65 false alerts on 191 records).
- **Official data and evaluator are absent.** There is no organiser intake file or official `evaluate.py` here. Scores from `make eval` are a local proxy (under-triage weight 20, over-triage weight 1), marked `proxy, not official`.
- **The external test is small and uses a nurse reference.** The MIMIC-IV-ED Demo has 207 stays with an ESI level. The reference is the triage nurse's own ESI 1–2, not an expert review, and the scale, country, and wording differ from KTAS. Read its intervals as wide. The full MIMIC-IV-ED needs credentialed PhysioNet access and is not used.
- **Patient self check-ins are self-reported.** The portal does not diagnose or show a triage level. Its red-flag advice is a fixed word list with no clinical review. A patient who is very unwell should not be using a form; the portal says so at the top. Identity is verified only by the nurse in person.
- **Patient accounts are prototype accounts.** Anyone can sign up when `OPD_PATIENT_SIGNUP` is true. There is no phone or e-mail verification, and the patient reference (`PT-…`) is derived from the account, not from a national health ID.
- **Sign-in is a prototype.** The prototype stores accounts in the local SQLite database with PBKDF2 password hashes and server-side bearer sessions. The demo accounts are fictional and share one password. There is no password reset, lockout, MFA, or SSO. Do not expose the API to a network without HTTPS and a proper identity provider.
- **Patient identity is minimal.** The patient ID is free text typed by the nurse. Previous encounters are linked only by an exact match on that ID. Names are optional and should be fictional in demonstrations.
- **Prescriptions are records, not orders.** The prototype has no drug database, interaction check, allergy check, or dose-range check. It only checks that the dose is a positive number.
- **Waiting time is elapsed time.** It runs from arrival to consultation start, or to now if the patient has not been seen. Nothing in the dashboard predicts waiting time.
- **"Today" uses one fixed clinic offset.** `OPD_CLINIC_UTC_OFFSET_MINUTES` defaults to 330 (India Standard Time). It is not a full time-zone database.
- **The nurse decides.** The tool cannot confirm its own suggestion.
- **Inputs are thin.** Vitals may be missing or mistyped. There are no labs, imaging, or ECG. Implausible values are flagged and are not silently corrected.
- **Language coverage is a fixed lexicon plus character n-grams.** English, Hindi (roman and Devanagari), Telugu (roman and script), and a small Tamil set are listed for red flags. That is not general translation. Dashboard Hindi and Telugu labels are drafts and are not clinically reviewed.
- **Fairness is not established.** The sex and age slices are descriptive counts on one test split. Small groups stay Pending.
- **A suggested department or red flag is not a diagnosis.**
- **The queue simulation is not a measured clinic.** It uses a synthetic arrival log and a fixed service time. Its assumptions are printed next to the result.
- **The audit log is append-only within the application.** It is not cryptographically immutable.
- **Metrics that have not been computed are Pending.** Do not treat a missing cell as zero.
