from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import requests

from app.config import get_settings
from app.schemas.api import LiveMatchSnapshot, LiveProviderStatus, SofaScoreTeamEvent, SofaScoreTeamEventsResult


PROVIDER_NAME = "sofascore-crawlora"
CRAWLORA_BASE_URL = "https://api.crawlora.net/api/v1"


def provider_status() -> LiveProviderStatus:
    settings = get_settings()
    configured = bool(settings.crawlora_api_key)
    if not configured:
        return LiveProviderStatus(
            provider=PROVIDER_NAME,
            status="provider_not_configured",
            configured=False,
            message="Falta configurar CRAWLORA_API_KEY para traer datos SofaScore en directo.",
        )
    return LiveProviderStatus(
        provider=PROVIDER_NAME,
        status="ready",
        configured=True,
        message="Crawlora configurado para consultar SofaScore por equipo y evento.",
    )


def fetch_team_events(team_id: int, direction: str = "next", page: int = 0) -> SofaScoreTeamEventsResult:
    if direction not in {"next", "last"}:
        direction = "next"
    payload = _crawlora_get("sofascore/team-events", id=team_id, direction=direction, page=page)
    data = payload.get("data") or {}
    return SofaScoreTeamEventsResult(
        provider=PROVIDER_NAME,
        team_id=team_id,
        direction=direction,
        page=page,
        has_next_page=bool(data.get("has_next_page")),
        message=f"{len(data.get('events') or [])} eventos SofaScore encontrados.",
        events=[_team_event_from_payload(event) for event in data.get("events") or []],
    )


def fetch_event_snapshot(event_id: int) -> LiveMatchSnapshot:
    event_payload = _crawlora_get("sofascore/event", id=event_id)
    event = (event_payload.get("data") or {}).get("event") or {}
    statistics = _safe_crawlora_get("sofascore/event-statistics", id=event_id)
    stats_data = (statistics.get("data") or {}) if statistics else {}
    home_score = event.get("home_score") or {}
    away_score = event.get("away_score") or {}
    return LiveMatchSnapshot(
        match_id=event_id,
        provider=PROVIDER_NAME,
        status=_status_type(event),
        message="Datos SofaScore capturados para el evento seleccionado.",
        minute=_event_minute(event),
        home_score=_to_int(home_score.get("current")),
        away_score=_to_int(away_score.get("current")),
        home_shots_on_target=_pick_stat(stats_data, "shotsOnTarget", "Shots on target", "Tiros a puerta"),
        away_shots_on_target=_pick_stat(stats_data, "shotsOnTarget", "Shots on target", "Tiros a puerta", side="away"),
        home_shots=_pick_stat(stats_data, "totalShotsOnGoal", "Total shots", "Tiros totales"),
        away_shots=_pick_stat(stats_data, "totalShotsOnGoal", "Total shots", "Tiros totales", side="away"),
        home_possession=_pick_stat(stats_data, "ballPossession", "Ball possession", "Posesion"),
        away_possession=_pick_stat(stats_data, "ballPossession", "Ball possession", "Posesion", side="away"),
        source_url=(event_payload.get("data") or {}).get("source_url"),
        captured_at=datetime.now(UTC),
    )


def _crawlora_get(endpoint: str, **params: Any) -> dict[str, Any]:
    settings = get_settings()
    if not settings.crawlora_api_key:
        raise RuntimeError("CRAWLORA_API_KEY is not configured")
    response = requests.get(
        f"{CRAWLORA_BASE_URL}/{endpoint}",
        params=params,
        headers={"x-api-key": settings.crawlora_api_key, "Accept": "application/json"},
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    if int(payload.get("code") or 200) >= 400:
        raise RuntimeError(payload.get("msg") or f"Crawlora request failed: {endpoint}")
    return payload


def _safe_crawlora_get(endpoint: str, **params: Any) -> dict[str, Any] | None:
    try:
        return _crawlora_get(endpoint, **params)
    except requests.RequestException:
        return None
    except RuntimeError:
        return None


def _team_event_from_payload(event: dict[str, Any]) -> SofaScoreTeamEvent:
    home = event.get("home_team") or {}
    away = event.get("away_team") or {}
    tournament = event.get("tournament") or {}
    return SofaScoreTeamEvent(
        event_id=int(event.get("id")),
        start_time=_event_start_time(event),
        status=_status_type(event),
        competition=str(tournament.get("unique_tournament_name") or tournament.get("name") or ""),
        country=str(tournament.get("category") or ""),
        home_team=str(home.get("name") or ""),
        away_team=str(away.get("name") or ""),
        home_team_id=_to_int(home.get("id")),
        away_team_id=_to_int(away.get("id")),
        home_score=_to_int((event.get("home_score") or {}).get("current")),
        away_score=_to_int((event.get("away_score") or {}).get("current")),
    )


def _event_start_time(event: dict[str, Any]) -> datetime:
    if event.get("start_time"):
        parsed = datetime.fromisoformat(str(event["start_time"]).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    timestamp = _to_int(event.get("start_timestamp"))
    if timestamp is not None:
        return datetime.fromtimestamp(timestamp, tz=UTC)
    return datetime.now(UTC)


def _status_type(event: dict[str, Any]) -> str:
    return str((event.get("status") or {}).get("type") or "scheduled")


def _event_minute(event: dict[str, Any]) -> int | None:
    status = event.get("status") or {}
    for key in ("minute", "currentPeriodStartTimestamp"):
        value = _to_int(status.get(key) or event.get(key))
        if value is not None and key == "minute":
            return value
    return None


def _pick_stat(payload: dict[str, Any], key: str, *labels: str, side: str = "home") -> int | None:
    for period in payload.get("periods") or []:
        for group in period.get("groups") or []:
            for item in group.get("items") or []:
                item_key = str(item.get("key") or "")
                item_name = str(item.get("name") or "")
                if item_key != key and _normalize(item_name) not in {_normalize(label) for label in labels}:
                    continue
                return _to_int(item.get(side))
    return None


def _normalize(value: str) -> str:
    return "".join(character.lower() for character in value if character.isalnum())


def _to_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(str(value).replace("%", "").strip()))
    except ValueError:
        return None
