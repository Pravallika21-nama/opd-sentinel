"""Training entry point for Classical ML and Quantum ML.

`make train` calls this module. It refuses to run until Phases 4 and 5
implement training, so a missing artefact is never replaced with a fake score.
"""


def main() -> None:
    """Train saved artefacts. Not available until the model phases land."""
    raise SystemExit(
        "Pending: training is not implemented yet (Classical ML in Phase 4, "
        "Quantum ML in Phase 5). No accuracy or recall figure exists."
    )


if __name__ == "__main__":
    main()
