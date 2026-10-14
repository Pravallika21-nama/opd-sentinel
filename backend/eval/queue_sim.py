"""First-come-first-served versus a priority queue.

This is a stretch simulation on the synthetic arrival log when the official
log is absent. Assumptions are returned next to the numbers. It is not a
measurement of a real clinic.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd


@dataclass
class _Patient:
    arrival: float
    level: int
    emergency: bool


def simulate(
    patients: list[_Patient], n_servers: int, service_minutes: float, *, priority: bool
) -> dict[str, float | int | None]:
    """Multi-server queue. Priority sorts by triage level, then arrival."""
    ordered = sorted(patients, key=lambda item: item.arrival)
    server_free = [0.0] * n_servers
    waiting: list[_Patient] = []
    emergency_waits: list[float] = []
    all_waits: list[float] = []
    index = 0

    def pick() -> _Patient:
        if priority:
            waiting.sort(key=lambda item: (item.level, item.arrival))
        else:
            waiting.sort(key=lambda item: item.arrival)
        return waiting.pop(0)

    while index < len(ordered) or waiting:
        next_arrival = ordered[index].arrival if index < len(ordered) else math.inf
        if waiting:
            server = min(range(n_servers), key=lambda slot: server_free[slot])
            if server_free[server] <= next_arrival:
                chosen = pick()
                start = max(server_free[server], chosen.arrival)
                all_waits.append(start - chosen.arrival)
                if chosen.emergency:
                    emergency_waits.append(start - chosen.arrival)
                server_free[server] = start + service_minutes
                continue
        if index < len(ordered):
            waiting.append(ordered[index])
            index += 1
            continue
        break
    return {
        "n": len(patients),
        "emergencies": int(sum(item.emergency for item in patients)),
        "mean_wait_all_minutes": _mean(all_waits),
        "mean_wait_emergencies_minutes": _mean(emergency_waits),
        "p95_wait_emergencies_minutes": _p95(emergency_waits),
    }


def run_queue_sim(path: Path, n_servers: int, service_minutes: float) -> dict[str, Any]:
    """Compare the two queues on one arrival file."""
    if not path.is_file():
        return {
            "status": "Pending",
            "reason": "Arrival log is missing. The official log is not in this repository.",
        }
    frame = pd.read_csv(path)
    patients = [
        _Patient(
            arrival=float(row.arrival_minute),
            level=int(row.triage_level),
            emergency=bool(int(row.emergency)),
        )
        for row in frame.itertuples(index=False)
    ]
    fcfs = simulate(patients, n_servers, service_minutes, priority=False)
    priority = simulate(patients, n_servers, service_minutes, priority=True)
    fcfs_wait = fcfs["mean_wait_emergencies_minutes"]
    priority_wait = priority["mean_wait_emergencies_minutes"]
    change = None
    if isinstance(fcfs_wait, float) and isinstance(priority_wait, float):
        change = round(priority_wait - fcfs_wait, 2)
    source = (
        str(frame["record_source"].iloc[0]) if "record_source" in frame.columns else "unspecified"
    )
    return {
        "status": "measured",
        "record_source": source,
        "assumptions": [
            f"{n_servers} servers",
            f"fixed service time {service_minutes} minutes",
            "arrivals taken from this file only",
            "priority uses the file's triage_level, not a live model",
            "no walk-aways and no opening-hours cutoff",
            "synthetic file is not an official arrival log"
            if source == "synthetic"
            else "source column is not synthetic",
        ],
        "first_come_first_served": fcfs,
        "priority": priority,
        "emergency_mean_wait_change_minutes": change,
        "note": (
            "Negative change means emergencies wait less "
            "under the priority queue in this simulation."
        ),
    }


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def _p95(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil(0.95 * len(ordered)) - 1))
    return round(ordered[index], 2)
