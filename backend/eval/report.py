"""Write reports/results.json, results.md, and an SVG figure when numbers exist.

Cells without a measured value are null in JSON and Pending in Markdown.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from core.paths import repo_root


def write_reports(payload: dict[str, Any], settings: dict[str, Any]) -> tuple[Path, Path]:
    """Persist the evaluation payload. Does not invent missing sections."""
    root = repo_root()
    json_path = root / settings["reports"]["json"]
    md_path = root / settings["reports"]["markdown"]
    figure_dir = root / settings["reports"]["figures"]
    json_path.parent.mkdir(parents=True, exist_ok=True)
    figure_dir.mkdir(parents=True, exist_ok=True)
    payload = dict(payload)
    payload["generated_at"] = datetime.now(UTC).isoformat()
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_path.write_text(_markdown(payload), encoding="utf-8")
    _write_recall_figure(figure_dir / "emergency_recall.svg", payload)
    return json_path, md_path


def _cell(value: Any) -> str:
    if value is None:
        return "Pending"
    if isinstance(value, list):
        return "[" + ", ".join(_cell(item) for item in value) + "]"
    if isinstance(value, float):
        return f"{value:.4f}".rstrip("0").rstrip(".")
    return str(value)


def _markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# OPD Sentinel evaluation",
        "",
        payload.get("disclaimer", ""),
        "",
        f"Data source: {payload.get('data_source', 'Pending')}.",
        f"Evaluation kind: {payload.get('evaluation_kind', 'Pending')}.",
        "",
        "Numbers below were computed by `make eval`. Missing cells are Pending.",
        "",
    ]
    sections = payload.get("sections", {})
    lines.insert(5, f"Dataset: {_cell(payload.get('dataset'))}.")
    for name in (
        "classical",
        "nurse_reference",
        "pipeline",
        "runtime",
        "robustness",
        "fairness",
        "queue_sim",
    ):
        lines.append(f"## {name}")
        lines.append("")
        section = sections.get(name)
        if not isinstance(section, dict) or section.get("status") == "Pending":
            reason = ""
            if isinstance(section, dict) and section.get("reason"):
                reason = " " + str(section["reason"])
            lines.append(f"Pending.{reason}")
            lines.append("")
            continue
        lines.extend(_section_lines(section))
        lines.append("")
    official = payload.get("official_evaluator", {})
    lines.append("## Official evaluator")
    lines.append("")
    lines.append(_cell(official.get("reason")))
    lines.append("")
    return "\n".join(lines)


def _table(rows: list[dict[str, Any]]) -> list[str]:
    headers: list[str] = []
    for row in rows:
        for header in row:
            if header not in headers:
                headers.append(header)
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        cells = [_cell(row[header]) if header in row else "" for header in headers]
        lines.append("| " + " | ".join(cells) + " |")
    return lines


def _section_lines(section: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    for key, value in section.items():
        if key == "status":
            continue
        if isinstance(value, list) and value and isinstance(value[0], dict):
            lines.append(f"### {key}")
            lines.append("")
            lines.extend(_table(value))
            lines.append("")
            continue
        if isinstance(value, dict):
            lines.append(f"### {key}")
            lines.append("")
            lines.extend(_section_lines(value))
            continue
        lines.append(f"- {key}: {_cell(value)}")
    return lines


def _write_recall_figure(path: Path, payload: dict[str, Any]) -> None:
    sections = payload.get("sections", {})
    bars: list[tuple[str, float]] = []
    for key, label in (
        ("classical", "Classical ML"),
        ("pipeline", "Full pipeline"),
        ("nurse_reference", "Triage nurse"),
    ):
        section = sections.get(key, {})
        recall = section.get("emergency_recall") if isinstance(section, dict) else None
        if isinstance(recall, int | float):
            bars.append((label, float(recall)))
    if not bars:
        path.write_text(
            "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='80'>"
            "<text x='16' y='40' font-family='sans-serif' font-size='16'>Pending</text></svg>",
            encoding="utf-8",
        )
        return
    width = 640
    height = 80 + 36 * len(bars)
    parts = [
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'>",
        "<rect width='100%' height='100%' fill='#f3f0e8'/>",
        "<text x='16' y='28' font-family='sans-serif' font-size='16' fill='#14202b'>"
        "Emergency recall (proxy, not official)</text>",
    ]
    for index, (label, recall) in enumerate(bars):
        y = 48 + index * 36
        bar = int(recall * 360)
        parts.append(
            f"<text x='16' y='{y + 16}' font-family='sans-serif' font-size='14' "
            f"fill='#14202b'>{label}</text>"
        )
        parts.append(f"<rect x='180' y='{y}' width='{bar}' height='20' fill='#0e4d5c'/>")
        parts.append(
            f"<text x='{188 + bar}' y='{y + 15}' font-family='sans-serif' "
            f"font-size='14' fill='#14202b'>"
            f"{recall:.3f}</text>"
        )
    parts.append("</svg>")
    path.write_text("".join(parts), encoding="utf-8")
