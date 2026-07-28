from __future__ import annotations

from datetime import UTC, datetime
from string import Formatter
from urllib.parse import quote

import requests
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Match
from app.schemas.api import LiveMatchSnapshot, LiveProviderStatus


PROVIDER_NAME = "sofascore"


def provider_status() -> LiveProviderStatus:
    settings = get_settings()
    configured = bool(settings.sofascore_live_url_template)
    if not configured:
        return LiveProviderStatus(
            provider=PROVIDER_NAME,
            status="provider_not_configured",
            configured=False,
            message="Falta configurar SOFASCORE_LIVE_URL_TEMPLATE con un feed autorizado.",
        )
    return LiveProviderStatus(
        provider=PROVIDER_NAME,
        status="ready",
        configured=True,
        message="Proveedor Sofascore configurado para consultar datos live autorizados.",
    )


def fetch_match_snapshot(db: Session, match_id: int) -> LiveMatchSnapshot | None:
    match = db.get(Match, match_id)
    if not match:
        return None

    settings = get_settings()
    if not settings.sofascore_live_url_template:
        return _empty_snapshot(match, "provider_not_configured", "Falta configurar el feed autorizado de Sofascore.")

    url = _build_url(settings.sofascore_live_url_template, match)
    headers = {"Accept": "application/json", "User-Agent": "within-football-analytics/1.0"}
    if settings.sofascore_api_token:
        headers["Authorization"] = f"Bearer {settings.sofascore_api_token}"

    try:
        response = requests.get(url, headers=headers, timeout=12)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        return _empty_snapshot(match, "request_failed", f"No se pudo consultar Sofascore: {exc}")
    except ValueError:
        return _empty_snapshot(match, "invalid_response", "El proveedor respondio, pero no devolvio JSON valido.")

    return _snapshot_from_payload(match, payload, url)


def _build_url(template: str, match: Match) -> str:
    values = {
        "match_id": match.id,
        "external_id": match.external_id or "",
        "date": match.match_date.date().isoformat(),
        "home_team": match.home_team.name,
        "away_team": match.away_team.name,
        "home_team_q": quote(match.home_team.name),
        "away_team_q": quote(match.away_team.name),
    }
    required = {field_name for _, field_name, _, _ in Formatter().parse(template) if field_name}
    safe_values = {key: values.get(key, "") for key in required}
    return template.format(**safe_values)


def _snapshot_from_payload(match: Match, payload: object, source_url: str) -> LiveMatchSnapshot:
    data = _first_match_payload(payload, match) or payload
    return LiveMatchSnapshot(
        match_id=match.id,
        provider=PROVIDER_NAME,
        status=str(_pick(data, "status", "matchStatus", "state", "period") or "live"),
        message="Datos live capturados desde proveedor autorizado.",
        minute=_to_int(_pick(data, "minute", "currentMinute", "time.minute", "statusTime.minute")),
        home_score=_to_int(_pick(data, "home_score", "homeScore.current", "home.score", "scores.home")),
        away_score=_to_int(_pick(data, "away_score", "awayScore.current", "away.score", "scores.away")),
        home_shots_on_target=_to_int(_pick_stat(data, "shots_on_target", "Shots on target", "Tiros a puerta")),
        away_shots_on_target=_to_int(_pick_stat(data, "shots_on_target", "Shots on target", "Tiros a puerta", side="away")),
        home_shots=_to_int(_pick_stat(data, "shots", "Total shots", "Tiros")),
        away_shots=_to_int(_pick_stat(data, "shots", "Total shots", "Tiros", side="away")),
        home_possession=_to_int(_pick_stat(data, "possession", "Ball possession", "Posesion")),
        away_possession=_to_int(_pick_stat(data, "possession", "Ball possession", "Posesion", side="away")),
        source_url=source_url,
        captured_at=datetime.now(UTC),
    )


def _first_match_payload(payload: object, match: Match) -> object | None:
    candidates = []
    if isinstance(payload, list):
        candidates = payload
    elif isinstance(payload, dict):
        for key in ("event", "match", "data"):
            if isinstance(payload.get(key), dict):
                return payload[key]
        for key in ("events", "matches", "data"):
            if isinstance(payload.get(key), list):
                candidates = payload[key]
                break

    home = _normalize(match.home_team.name)
    away = _normalize(match.away_team.name)
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        candidate_home = _normalize(str(_pick(candidate, "home_team", "homeTeam.name", "home.name") or ""))
        candidate_away = _normalize(str(_pick(candidate, "away_team", "awayTeam.name", "away.name") or ""))
        if candidate_home == home and candidate_away == away:
            return candidate
    return candidates[0] if candidates else None


def _pick(payload: object, *paths: str) -> object | None:
    for path in paths:
        current = payload
        for part in path.split("."):
            if not isinstance(current, dict) or part not in current:
                current = None
                break
            current = current[part]
        if current is not None:
            return current
    return None


def _pick_stat(payload: object, key: str, *labels: str, side: str = "home") -> object | None:
    direct = _pick(payload, f"{side}_{key}", f"{side}.{key}", f"statistics.{side}.{key}")
    if direct is not None:
        return direct
    if not isinstance(payload, dict):
        return None
    rows = payload.get("statistics") or payload.get("stats") or []
    if isinstance(rows, dict):
        rows = rows.get("groups") or rows.get("items") or []
    for row in _flatten(rows):
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or row.get("label") or row.get("type") or "")
        if _normalize(name) not in {_normalize(label) for label in labels} | {_normalize(key)}:
            continue
        value = row.get("home") if side == "home" else row.get("away")
        return value if value is not None else row.get("homeValue" if side == "home" else "awayValue")
    return None


def _flatten(value: object) -> list[object]:
    if isinstance(value, list):
        result = []
        for item in value:
            if isinstance(item, dict) and isinstance(item.get("statisticsItems"), list):
                result.extend(item["statisticsItems"])
            elif isinstance(item, dict) and isinstance(item.get("items"), list):
                result.extend(item["items"])
            else:
                result.append(item)
        return result
    return []


def _empty_snapshot(match: Match, status: str, message: str) -> LiveMatchSnapshot:
    return LiveMatchSnapshot(
        match_id=match.id,
        provider=PROVIDER_NAME,
        status=status,
        message=message,
        source_url=None,
        captured_at=datetime.now(UTC),
    )


def _to_int(value: object | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.replace("%", "").strip()
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _normalize(value: str) -> str:
    return "".join(character.lower() for character in value if character.isalnum())
