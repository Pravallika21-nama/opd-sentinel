"""Write a labelled synthetic intake file and the seeded splits.

The official intake file is not in this repository. This generator is a
stand-in with the same logical columns. Every row is marked
`record_source=synthetic`. It is not a hospital extract.

Hidden labels (triage_level, department, emergency) are written for
evaluation. Training code must not use them as features.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from core.config_loader import load_settings  # noqa: E402
from core.constants import LABEL_FIELDS  # noqa: E402
from core.paths import repo_root  # noqa: E402
from ml.dataset import load_table, resolve_intake_source, write_splits  # noqa: E402

LANGS = ["en", "hi", "te", "hi_script", "te_script"]
LANG_P = [0.42, 0.28, 0.14, 0.08, 0.08]


def _configure_stdio() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def _say(bank: dict[str, list[str]], lang: str, rng: np.random.Generator) -> str:
    choices = bank.get(lang) or bank["en"]
    return str(rng.choice(choices))


MILD = {
    "en": [
        "mild cold and cough for two days",
        "body ache and runny nose",
        "halka fever yesterday, better now",
    ],
    "hi": ["halka sardi aur khansi do din se", "badan dard aur zukam", "kal halka bukhar tha"],
    "te": ["chinnadi jwaram mariyu daggu", "halka sardi", "nenu nundi konchem jwaram"],
    "hi_script": ["हल्का सर्दी और खांसी", "बदन दर्द"],
    "te_script": ["చిన్న జ్వరం", "తేలికపాటి దగ్గు"],
}
PAIN = {
    "en": ["knee pain for a week", "back pain after lifting", "ankle pain since yesterday"],
    "hi": ["ghutne mein dard ek hafte se", "kamar dard"],
    "te": ["mokalu noppi", "nadumu noppi"],
    "hi_script": ["घुटने में दर्द"],
    "te_script": ["మోకాలి నొప్పి"],
}
FEVER = {
    "en": ["fever and cough for three days", "fever with body pain"],
    "hi": ["teen din se bukhar aur khansi", "bukhar aur badan dard"],
    "te": ["moodu rojula nundi jwaram", "jwaram mariyu daggu"],
    "hi_script": ["तीन दिन से बुखार"],
    "te_script": ["మూడు రోజుల జ్వరం"],
}
HTN = {
    "en": ["here for blood pressure check", "headache and known high bp"],
    "hi": ["bp check karane aaya", "sir dard aur high bp"],
    "te": ["bp chudadam", "tala noppi"],
    "hi_script": ["बीपी चेक कराना है"],
    "te_script": ["బీపీ చూడటం"],
}
CHILD = {
    "en": ["child has a cold", "child not eating well since yesterday"],
    "hi": ["bacha ko sardi hai", "bacha theek se kha nahi raha"],
    "te": ["pillaki sardi", "pilla tintaledu"],
    "hi_script": ["बच्चे को सर्दी है"],
    "te_script": ["పిల్లకి జలుబు"],
}
GI = {
    "en": ["loose motions since morning", "mild stomach upset"],
    "hi": ["subah se dast", "pet mein halka dard"],
    "te": ["kabhi loose motions", "kadupu lo konchem noppi"],
    "hi_script": ["सुबह से दस्त"],
    "te_script": ["కడుపులో తేలికపాటి నొప్పి"],
}
INJURY = {
    "en": ["small cut on the hand", "twisted ankle, can walk"],
    "hi": ["haath mein chhota cut", "pair moad diya, chal leta hai"],
    "te": ["chetilo chinna cut", "kalu thirigindi"],
    "hi_script": ["हाथ में छोटा कट"],
    "te_script": ["చేతికి చిన్న గాయం"],
}
HYPOXIA = {
    "en": ["cannot breathe since morning", "short of breath and cough"],
    "hi": ["saans nahi le pa raha", "saans phool rahi hai"],
    "te": ["swasa aadatam ledu", "swasa ledu"],
    "hi_script": ["सांस नहीं आ रही"],
    "te_script": ["ఊపిరి ఆడటం లేదు"],
}
SHOCK = {
    "en": ["dizzy and about to collapse", "feeling faint and cold"],
    "hi": ["chakkar aa raha hai, girne wala", "behosh sa lag raha hai"],
    "te": ["talla tirugutundi", "sustu poyadu"],
    "hi_script": ["चक्कर आ रहा है"],
    "te_script": ["తల తిరుగుతోంది"],
}
TACHY = {
    "en": ["heart racing for an hour", "palpitations"],
    "hi": ["dil tez dhadak raha hai", "seene mein dhak dhak"],
    "te": ["gunde veganga kodutundi", "gunde noppi kalisi padakunda"],
    "hi_script": ["दिल तेज धड़क रहा है"],
    "te_script": ["గుండె వేగంగా కొడుతోంది"],
}
HIGH_FEVER = {
    "en": ["very high fever and shivering", "burning fever since last night"],
    "hi": ["bahut tez bukhar aur kapkapi", "raat se tez bukhar"],
    "te": ["chala ekkuva jwaram", "jwaram ekkuva undi"],
    "hi_script": ["बहुत तेज बुखार"],
    "te_script": ["చాలా ఎక్కువ జ్వరం"],
}
STROKE = {
    "en": ["slurred speech and face droop", "one side weak since one hour"],
    "hi": ["muh tedha ho gaya aur bol nahi pa raha", "lakwa jaisa lag raha hai"],
    "te": ["noru vankara ayindi", "matladalem"],
    "hi_script": ["मुंह टेढ़ा हो गया", "लकवा"],
    "te_script": ["నోరు వంకర"],
}
SEIZURE = {
    "en": ["seizure at home", "convulsion just now"],
    "hi": ["daura pada ghar par", "daura aaya"],
    "te": ["fit vachindi", "daura vachindi"],
    "hi_script": ["दौरा पड़ा"],
    "te_script": ["ఫిట్ వచ్చింది"],
}
BLEED = {
    "en": ["bleeding heavily from a wound", "severe bleeding after injury"],
    "hi": ["khoon beh raha hai bahut", "khoon bahut nikal raha hai"],
    "te": ["raktham poyindi", "raktham ekkuva poyindi"],
    "hi_script": ["खून बह रहा है"],
    "te_script": ["రక్తం పోతుంది"],
}
POISON = {
    "en": ["drank poison", "poisoning an hour ago"],
    "hi": ["zeher kha liya", "zeher pi liya"],
    "te": ["visham thaginadu", "visham iccharu"],
    "hi_script": ["जहर खा लिया"],
    "te_script": ["విషం తాగాడు"],
}
CHEST = {
    "en": ["chest pain since morning"],
    "hi": ["seene mein dard ho raha hai"],
    "te": ["gunde noppi undi"],
    "hi_script": ["सीने में दर्द"],
    "te_script": ["గుండె నొప్పి ఉంది"],
}
CONDITIONS = {
    "en": ["diabetes", "hypertension", "asthma", ""],
    "hi": ["madhumeh", "high bp", "damma", ""],
    "te": ["chakkarini", "bp undi", "dama", ""],
}
MEDS = ["metformin", "amlodipine", "salbutamol inhaler", "paracetamol", ""]


def _base_vitals(rng: np.random.Generator) -> dict[str, Any]:
    systolic = float(np.clip(rng.normal(122, 10), 100, 150))
    diastolic = float(np.clip(rng.normal(78, 6), 60, systolic - 20))
    return {
        "systolic_bp": round(systolic, 1),
        "diastolic_bp": round(diastolic, 1),
        "pulse": round(float(np.clip(rng.normal(80, 8), 62, 100)), 1),
        "temperature_c": round(float(np.clip(rng.normal(36.8, 0.2), 36.2, 37.3)), 1),
        "spo2": int(rng.integers(97, 100)),
    }


def _age(rng: np.random.Generator) -> float:
    roll = float(rng.random())
    if roll < 0.02:
        return round(float(rng.uniform(0.05, 0.9)), 2)
    if roll < 0.12:
        return float(rng.integers(1, 15))
    if roll < 0.27:
        return float(rng.integers(65, 92))
    return float(rng.integers(15, 65))


def _apply_noise(row: dict[str, Any], rng: np.random.Generator) -> None:
    """Inject missing and implausible entries without changing the hidden label."""
    roll = float(rng.random())
    if roll < 0.02:
        row["systolic_bp"] = 0
    elif roll < 0.035:
        row["temperature_c"] = 96
    elif roll < 0.05:
        row["spo2"] = 140
    if float(rng.random()) < 0.04:
        row["pulse"] = None
    if float(rng.random()) < 0.03:
        row["spo2"] = None
    if float(rng.random()) < 0.02:
        row["complaint"] = ""
    temp = row["temperature_c"]
    if temp is not None and float(rng.random()) < 0.015 and 35 <= float(temp) <= 42:
        row["temperature_c"] = round(float(temp) * 9 / 5 + 32, 1)


def _row(rng: np.random.Generator, index: int, emergency: bool) -> dict[str, Any]:
    lang = str(rng.choice(LANGS, p=LANG_P))
    age = _age(rng)
    vitals = _base_vitals(rng)
    if emergency:
        kind = str(
            rng.choice(
                [
                    "hypoxia",
                    "shock",
                    "tachycardia",
                    "high_fever",
                    "stroke",
                    "seizure",
                    "bleed",
                    "poison",
                ]
            )
        )
    else:
        kind = str(
            rng.choice(["mild", "pain", "fever", "htn", "child", "gi", "injury", "pregnancy"])
        )
    department = "General Medicine"
    level = 4
    complaint = _say(MILD, lang, rng)
    if kind == "mild":
        complaint, department, level = (
            _say(MILD, lang, rng),
            "General Medicine",
            int(rng.choice([4, 5])),
        )
    elif kind == "pain":
        complaint, department, level = _say(PAIN, lang, rng), "Orthopedics", int(rng.choice([4, 5]))
    elif kind == "fever":
        complaint, department, level = _say(FEVER, lang, rng), "General Medicine", 3
        vitals["temperature_c"] = round(float(rng.uniform(38.0, 38.6)), 1)
        vitals["pulse"] = round(float(rng.uniform(90, 110)), 1)
    elif kind == "htn":
        complaint, department, level = _say(HTN, lang, rng), "Cardiology", 3
        vitals["systolic_bp"] = round(float(rng.uniform(150, 175)), 1)
        vitals["diastolic_bp"] = round(float(rng.uniform(90, 105)), 1)
    elif kind == "child":
        complaint, department, level = _say(CHILD, lang, rng), "Pediatrics", 4
        age = float(rng.integers(1, 11))
    elif kind == "gi":
        complaint, department, level = _say(GI, lang, rng), "General Medicine", 4
    elif kind == "injury":
        complaint, department, level = _say(INJURY, lang, rng), "General Surgery", 3
    elif kind == "pregnancy":
        complaint, department, level = "antenatal visit, garbh check", "Obstetrics", 4
        age = float(rng.integers(18, 40))
    elif kind == "hypoxia":
        complaint, department, level = _say(HYPOXIA, lang, rng), "Pulmonology", 1
        vitals["spo2"] = int(rng.integers(74, 89))
        vitals["pulse"] = round(float(rng.uniform(100, 125)), 1)
        if vitals["spo2"] >= 82:
            level = 2
    elif kind == "shock":
        complaint, department, level = _say(SHOCK, lang, rng), "Emergency", 1
        vitals["systolic_bp"] = round(float(rng.uniform(72, 88)), 1)
        vitals["diastolic_bp"] = round(float(rng.uniform(40, 55)), 1)
        vitals["pulse"] = round(float(rng.uniform(115, 145)), 1)
    elif kind == "tachycardia":
        complaint, department, level = _say(TACHY, lang, rng), "Cardiology", 1
        vitals["pulse"] = round(float(rng.uniform(136, 165)), 1)
    elif kind == "high_fever":
        complaint, department, level = _say(HIGH_FEVER, lang, rng), "General Medicine", 2
        vitals["temperature_c"] = round(float(rng.uniform(40.0, 41.3)), 1)
        vitals["pulse"] = round(float(rng.uniform(100, 118)), 1)
        if float(vitals["temperature_c"]) >= 41:
            level = 1
    elif kind == "stroke":
        complaint, department, level = _say(STROKE, lang, rng), "Neurology", 1
    elif kind == "seizure":
        complaint, department, level = _say(SEIZURE, lang, rng), "Neurology", 1
    elif kind == "bleed":
        complaint, department, level = _say(BLEED, lang, rng), "General Surgery", 1
        vitals["pulse"] = round(float(rng.uniform(104, 125)), 1)
    elif kind == "poison":
        complaint, department, level = _say(POISON, lang, rng), "Emergency", 1
    if (
        emergency
        and kind in {"hypoxia", "shock", "tachycardia", "high_fever"}
        and float(rng.random()) < 0.25
    ):
        complaint = _say(MILD, lang, rng)
    if not emergency and float(rng.random()) < 0.05:
        complaint = _say(CHEST, lang, rng)
    sex = str(rng.choice(["female", "male", "female", "male", "other", ""]))
    condition_bank = CONDITIONS.get(lang, CONDITIONS["en"])
    row: dict[str, Any] = {
        "case_id": f"syn-{index:05d}",
        "age": age,
        "sex": sex,
        "complaint": complaint,
        "known_conditions": str(rng.choice(condition_bank)) if float(rng.random()) < 0.35 else "",
        "medications": str(rng.choice(MEDS)) if float(rng.random()) < 0.4 else "",
        "triage_level": int(level),
        "department": department,
        "emergency": int(emergency),
        "record_source": "synthetic",
    }
    row.update(vitals)
    _apply_noise(row, rng)
    return row


def build_frame(rows: int, rate: float, seed: int) -> pd.DataFrame:
    """Deterministic synthetic table with about `rate` emergencies."""
    rng = np.random.default_rng(seed)
    n_emergency = int(round(rows * rate))
    flags = np.array([1] * n_emergency + [0] * (rows - n_emergency))
    rng.shuffle(flags)
    records = [_row(rng, index, bool(flag)) for index, flag in enumerate(flags)]
    return pd.DataFrame.from_records(records)


def build_arrivals(rows: int, seed: int) -> pd.DataFrame:
    """Synthetic stand-in for a missing official arrival log."""
    rng = np.random.default_rng(seed + 17)
    n_emergency = int(round(rows * 0.04))
    flags = np.array([1] * n_emergency + [0] * (rows - n_emergency))
    rng.shuffle(flags)
    arrivals = rng.uniform(0, 480, size=rows)
    records = []
    for index, flag in enumerate(flags):
        level = int(rng.choice([1, 2])) if flag else int(rng.choice([3, 4, 4, 5]))
        records.append(
            {
                "case_id": f"arr-{index:04d}",
                "arrival_minute": round(float(arrivals[index]), 3),
                "triage_level": level,
                "emergency": int(flag),
                "record_source": "synthetic",
            }
        )
    return pd.DataFrame.from_records(records)


def main() -> None:
    """Write synthetic files and stratified splits. Print prevalence. No model scores."""
    _configure_stdio()
    settings = load_settings()
    synthetic_cfg = settings["synthetic"]
    root = repo_root()
    synthetic_path = root / settings["data"]["synthetic_path"]
    arrivals_path = root / settings["data"]["arrivals_synthetic_path"]
    processed = root / settings["data"]["processed_dir"]
    synthetic_path.parent.mkdir(parents=True, exist_ok=True)
    frame = build_frame(
        int(synthetic_cfg["rows"]),
        float(synthetic_cfg["emergency_rate"]),
        int(synthetic_cfg["seed"]),
    )
    frame.to_csv(synthetic_path, index=False)
    build_arrivals(int(settings["queue_sim"]["arrivals"]), int(synthetic_cfg["seed"])).to_csv(
        arrivals_path, index=False
    )
    path, kind = resolve_intake_source()
    extra: dict[str, Any] = {}
    if kind == "official":
        source = load_table(path)
        print(f"Official file found at {path}. Splits use it.")
        print("config/settings.yaml column_map must name the real headers. They are not guessed.")
        note = "Splits were built from the official file."
    elif kind == "public_deidentified_ktas":
        source = load_table(path, use_column_map=False)
        print(f"Public KTAS dataset found at {path}. Splits use it.")
        print("Emergency-department records, not OPD records. See DATASET.md.")
        note = (
            "Real, de-identified emergency-department records. Labels are expert KTAS levels. "
            "Not OPD data and not clinically equivalent to this application's levels."
        )
        prepared = path.with_suffix(".json")
        if prepared.is_file():
            extra = json.loads(prepared.read_text(encoding="utf-8"))
    else:
        source = frame
        print("No official file and no prepared KTAS file.")
        print("Splits use the labelled synthetic file. This is not a hospital extract.")
        print("Run make ktas to prepare the public KTAS dataset.")
        note = "Synthetic rows are labelled record_source=synthetic."
        extra = {"dataset": "Synthetic intake generator (scripts/make_synthetic.py)"}
    counts = write_splits(source, processed, int(settings["random_seed"]), settings["splits"])
    emergencies = int(source["emergency"].sum())
    manifest = {
        "source_kind": kind,
        "rows": int(len(source)),
        "emergency_count": emergencies,
        "emergency_prevalence": emergencies / len(source),
        "split_counts": counts,
        "seed": int(settings["random_seed"]),
        "label_fields": list(LABEL_FIELDS),
        "note": note,
        **extra,
    }
    (processed / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"source: {kind}")
    print(f"rows: {len(source)}")
    print(f"emergency prevalence: {emergencies / len(source):.4f} ({emergencies}/{len(source)})")
    print("split sizes: " + ", ".join(f"{name}={count}" for name, count in counts.items()))
    for name in ("train", "val", "test"):
        part = pd.read_csv(processed / f"{name}.csv")
        part_emergencies = int(part["emergency"].sum())
        print(
            f"  {name}: {len(part)} rows, emergencies {part_emergencies} "
            f"({part_emergencies / len(part):.4f})"
        )
    print("Labels are stored on the splits and are not features. No accuracy is computed here.")


if __name__ == "__main__":
    main()
