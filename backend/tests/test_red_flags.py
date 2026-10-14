"""Red-flag lexicon, including negation and more than one script."""

from core.red_flags import find_red_flags


def _ids(text: str) -> set[str]:
    return {item.id for item in find_red_flags(text)}


def test_english_chest_pain() -> None:
    assert "chest_pain" in _ids("chest pain since morning")


def test_negated_english_chest_pain() -> None:
    assert "chest_pain" not in _ids("no chest pain, only cough")


def test_hindi_roman_and_devanagari() -> None:
    assert "chest_pain" in _ids("seene mein dard ho raha hai")
    assert "chest_pain" in _ids("सीने में दर्द")
    assert "chest_pain" not in _ids("seene mein dard nahi hai")


def test_telugu_script_and_breathlessness() -> None:
    assert "chest_pain" in _ids("గుండె నొప్పి ఉంది")
    assert "breathlessness" in _ids("saans nahi le pa raha")
    assert "chest_pain" not in _ids("gunde noppi ledu")


def test_tamil_roman_chest_pain() -> None:
    assert "chest_pain" in _ids("nenju vali since morning")
