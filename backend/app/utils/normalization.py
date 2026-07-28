import re
import unicodedata


def normalize_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip().lower())
    ascii_text = "".join(char for char in normalized if not unicodedata.combining(char))
    compact = re.sub(r"[^a-z0-9]+", " ", ascii_text)
    return re.sub(r"\s+", " ", compact).strip()
