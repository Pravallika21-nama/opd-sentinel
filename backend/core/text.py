"""Complaint text helpers.

Normalisation keeps a copy of the original text at the call site. This module
does not translate and does not identify a language. `script_hint` only reports
Unicode blocks that are present.
"""

from __future__ import annotations

import re
import unicodedata

_DEVANAGARI = range(0x0900, 0x0980)
_TAMIL = range(0x0B80, 0x0C00)
_TELUGU = range(0x0C00, 0x0C80)


def normalise_text(text: str | None) -> str:
    """Lowercase, NFKC-normalise, and collapse whitespace. Empty input stays empty."""
    if text is None:
        return ""
    normalised = unicodedata.normalize("NFKC", str(text)).casefold()
    return re.sub(r"\s+", " ", normalised).strip()


def script_hint(text: str | None) -> str:
    """Name Unicode blocks found in the text. Latin is the default. Not a language ID."""
    found: list[str] = []
    for char in text or "":
        code = ord(char)
        if code in _DEVANAGARI and "Devanagari" not in found:
            found.append("Devanagari")
        elif code in _TAMIL and "Tamil" not in found:
            found.append("Tamil")
        elif code in _TELUGU and "Telugu" not in found:
            found.append("Telugu")
    if not found:
        return "Latin"
    return ", ".join(found)


def phrase_span(text: str, phrase: str) -> tuple[int, int] | None:
    """Return the span of `phrase` in normalised text, or None.

    Latin phrases use word boundaries so `fit` does not match `fitness`.
    Phrases that contain non-Latin characters use a direct substring match.
    """
    if not phrase:
        return None
    if any(ord(char) > 127 for char in phrase):
        index = text.find(phrase)
        if index < 0:
            return None
        return index, index + len(phrase)
    match = re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", text)
    if match is None:
        return None
    return match.start(), match.end()


def window_has_token(window: str, tokens: set[str]) -> bool:
    """True when any whole token in `window` is a listed negator."""
    if not window or not tokens:
        return False
    words = set(re.findall(r"\w+", window, flags=re.UNICODE))
    return bool(words & tokens)


def is_negated(text: str, start: int, end: int, before: set[str], after: set[str]) -> bool:
    """Negation window around a matched phrase.

    English negators are expected before the phrase (`no chest pain`).
    Hindi and Telugu negators in this lexicon are expected after it
    (`chest pain nahi`, `gunde noppi ledu`). A negator that is part of the
    matched phrase itself does not count: `saans nahi` is a symptom, not a denial.
    """
    prefix = text[max(0, start - 32) : start]
    suffix = text[end : end + 32]
    prefix_tokens = " ".join(prefix.split()[-3:])
    suffix_tokens = " ".join(suffix.split()[:3])
    return window_has_token(prefix_tokens, before) or window_has_token(suffix_tokens, after)
