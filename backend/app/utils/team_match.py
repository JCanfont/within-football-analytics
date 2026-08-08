from __future__ import annotations

import re
import unicodedata


def normalize_team(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip().lower())
    ascii_text = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]", "", ascii_text)


def same_team(left: str, right: str) -> bool:
    normalized_left = normalize_team(left)
    normalized_right = normalize_team(right)
    if not normalized_left or not normalized_right:
        return False
    if normalized_left == normalized_right:
        return True
    shortest = min(len(normalized_left), len(normalized_right))
    return shortest >= 5 and (
        normalized_left in normalized_right or normalized_right in normalized_left
    )
