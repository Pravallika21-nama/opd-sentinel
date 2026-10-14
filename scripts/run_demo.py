"""One-command walkthrough of the seven demo steps.

Every case printed here is an example, not a clinical outcome.
Model scores are whatever the saved artefacts return. Missing artefacts stay Pending.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.db import init_db  # noqa: E402
from app.services.pipeline import run_triage  # noqa: E402
from app.services.store import seed_demo_cases  # noqa: E402
from core.config_loader import load_demo_config, load_settings  # noqa: E402
from core.paths import repo_root  # noqa: E402


def _configure_stdio() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def _show(decision_dump: dict, latency_ms: float) -> None:
    print("1. Enter")
    print("   Intake accepted. Example, not a real clinical outcome.")
    print("2. Validate")
    issues = decision_dump["validation_issues"]
    if issues:
        for issue in issues:
            print(f"   {issue['field']}: {issue['status']} — {issue['detail']}")
    else:
        print("   No plausibility issues on the entered fields.")
    print("3. Run models")
    classical = decision_dump["classical"]
    quantum = decision_dump["quantum"]
    if classical:
        print(f"   Classical ML level {classical['level']}, p={classical['p_emergency']:.3f}")
    else:
        print("   Classical ML: Pending (artefact not loaded)")
    if quantum:
        print(
            "   Quantum ML (experimental, simulator only) "
            f"level {quantum['level']}, risk={quantum['p_emergency']:.3f}"
        )
        print("   No speedup or advantage is claimed.")
    else:
        print("   Quantum ML unavailable")
    print("4. Apply Safety-Rule Layer")
    if decision_dump["fired_rules"]:
        for rule in decision_dump["fired_rules"]:
            print(f"   {rule['id']}: minimum level {rule['min_level']}. {rule['reason']}")
    else:
        print("   No rule fired.")
    print("5. Display")
    print(f"   Triage level: {decision_dump['triage_level']}")
    print(f"   Department: {decision_dump['department']}")
    print(f"   Red flags: {[flag['label'] for flag in decision_dump['red_flags']] or 'none'}")
    print(f"   Uncertainty: {decision_dump['uncertainty']}")
    print(f"   Latency ms: {latency_ms:.1f}")
    print("6. Escalate if risky")
    if decision_dump["abstain"]:
        print("   Cannot assess, send to nurse now")
        for reason in decision_dump["abstain_reasons"]:
            print(f"   {reason}")
    elif decision_dump["triage_level"] is not None and decision_dump["triage_level"] <= 2:
        print("   Escalated: level is 1 or 2, so the case is pinned for Nurse Review.")
    else:
        print("   No extra escalation beyond the displayed level.")
    print("7. Compare models")
    if decision_dump["models_disagree"]:
        print("   Models disagree. Nurse Review should see the more urgent view.")
    else:
        print("   Models do not disagree on this example, or Quantum ML did not return a level.")
    report = repo_root() / load_settings()["reports"]["json"]
    if report.is_file():
        payload = json.loads(report.read_text(encoding="utf-8"))
        kind = payload.get("evaluation_kind", "Pending")
        print(f"   Evaluation file present. Kind: {kind}. Read reports/results.md for the numbers.")
    else:
        print("   Evaluation comparison: Pending. Run make eval. No score is invented here.")


def main() -> None:
    """Seed illustrative cases and print the seven steps for the first one."""
    _configure_stdio()
    print("OPD Sentinel demo. Example, not a real clinical outcome.")
    init_db()
    added = seed_demo_cases()
    print(f"Queue seed added {added} new illustrative cases.")
    demo = load_demo_config()
    first = demo["cases"][0]
    print(f"Case: {first['title']}")
    print(demo["banner"])
    decision, latency_ms = run_triage(first["intake"], illustrative=True)
    _show(decision.model_dump(mode="json"), latency_ms)
    print(
        "Nurse Review is required before this suggestion is a decision. "
        "Nothing here is a diagnosis."
    )


if __name__ == "__main__":
    main()
