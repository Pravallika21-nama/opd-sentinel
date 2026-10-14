"""Red-flag phrase matching.

A matched phrase is a reason to look harder. It is not a diagnosis.
The lexicon covers English, Hindi (roman and Devanagari), Telugu (roman and
script), and a small Tamil roman set. It is not a translator.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from core.config_loader import load_red_flag_config
from core.schemas import RedFlagMatch
from core.text import is_negated, normalise_text, phrase_span


class RedFlagLexicon:
    """Compiled lexicon. Phrases are matched longest-first within each flag."""

    def __init__(self, flags: list[dict[str, Any]], before: set[str], after: set[str]) -> None:
        self.flags = flags
        self.before = before
        self.after = after

    def find(self, complaint: str | None) -> list[RedFlagMatch]:
        """Return non-negated matches. The original complaint is not modified."""
        text = normalise_text(complaint)
        if not text:
            return []
        found: list[RedFlagMatch] = []
        for flag in self.flags:
            phrases = sorted(
                (normalise_text(item) for item in flag["phrases"]), key=len, reverse=True
            )
            for phrase in phrases:
                span = phrase_span(text, phrase)
                if span is None:
                    continue
                if is_negated(text, span[0], span[1], self.before, self.after):
                    continue
                found.append(RedFlagMatch(id=flag["id"], label=flag["label"], phrase=phrase))
                break
        return found


@lru_cache(maxsize=1)
def get_lexicon() -> RedFlagLexicon:
    """Load and cache the red-flag lexicon."""
    config = load_red_flag_config()
    negation = config["negation"]
    before = {normalise_text(token) for token in negation["before"]}
    after = {normalise_text(token) for token in negation["after"]}
    return RedFlagLexicon(list(config["flags"]), before, after)


def find_red_flags(complaint: str | None) -> list[RedFlagMatch]:
    """Match the complaint against the configured lexicon."""
    return get_lexicon().find(complaint)
