from datetime import UTC, datetime
from typing import Any

import requests

from app.config import Settings, get_settings
from app.schemas.api import FlashscoreMatchRead, FlashscoreMatchesResult


ODDS_THRESHOLD = 1.5
FOOTBALL_SPORT_ID = 1


def fetch_flashscore_matches(day: int = 0, settings: Settings | None = None) -> FlashscoreMatchesResult:
    settings = settings or get_settings()
    if not settings.rapidapi_key:
        return FlashscoreMatchesResult(
            status="not_configured",
            message="Flashscore necesita RAPIDAPI_KEY.",
            configured=False,
        )

    headers = {
        "X-RapidAPI-Key": settings.rapidapi_key,
        "X-RapidAPI-Host": settings.flashscore_api_host,
        "Content-Type": "application/json",
    }
    base_url = f"https://{settings.flashscore_api_host}"
    try:
        schedule_payload = _get_json(
            f"{base_url}/api/flashscore/v2/matches/list",
            headers,
            {"sport_id": FOOTBALL_SPORT_ID, "day": day, "timezone": "Europe/Madrid"},
        )
    except requests.RequestException:
        return FlashscoreMatchesResult(
            status="request_failed",
            message="No se pudo consultar la jornada de Flashscore.",
            configured=True,
        )

    matches = _parse_matches(schedule_payload)
    if day == 0:
        try:
            live_payload = _get_json(
                f"{base_url}/api/flashscore/v2/matches/live",
                headers,
                {"sport_id": FOOTBALL_SPORT_ID, "timezone": "Europe/Madrid"},
            )
            matches = _merge_live_matches(matches, _parse_matches(live_payload))
        except requests.RequestException:
            pass

    try:
        odds_payload = _get_json(
            f"{base_url}/api/livescores/sports/{FOOTBALL_SPORT_ID}/odds",
            headers,
            {"dayOffset": day, "lang": "en", "version": 2},
        )
        odds_by_event = _parse_odds_by_event(odds_payload)
    except requests.RequestException:
        odds_by_event = {}

    enriched = [_with_odds_and_alert(match, odds_by_event.get(match.event_id)) for match in matches]
    enriched.sort(key=lambda match: (match.start_time or datetime.max.replace(tzinfo=UTC), match.competition, match.home_team))
    qualifying = sum(match.favorite_odds is not None for match in enriched)
    return FlashscoreMatchesResult(
        status="ok",
        message=f"{len(enriched)} partidos Flashscore · {qualifying} con cuota de equipo igual o inferior a {ODDS_THRESHOLD:.2f}.",
        configured=True,
        threshold=ODDS_THRESHOLD,
        matches=enriched,
    )


def _get_json(url: str, headers: dict[str, str], params: dict[str, Any]) -> Any:
    response = requests.get(url, headers=headers, params=params, timeout=20)
    response.raise_for_status()
    return response.json()


def _parse_matches(payload: Any) -> list[FlashscoreMatchRead]:
    matches: dict[str, FlashscoreMatchRead] = {}
    for record in _walk_dicts(payload):
        event_id = _string_value(record, "match_id", "event_id", "eventId", "id")
        home_team = _team_name(record, "home")
        away_team = _team_name(record, "away")
        if not event_id or not home_team or not away_team:
            continue
        candidate = FlashscoreMatchRead(
            event_id=event_id,
            start_time=_datetime_value(record, "start_time", "startTime", "timestamp", "start_timestamp"),
            competition=_competition_name(record),
            home_team=home_team,
            away_team=away_team,
            status=_string_value(record, "stage", "status", "state") or "scheduled",
            minute=_minute_value(record),
            home_score=_score_value(record, "home"),
            away_score=_score_value(record, "away"),
        )
        previous = matches.get(event_id)
        matches[event_id] = _prefer_live(previous, candidate) if previous else candidate
    return list(matches.values())


def _merge_live_matches(scheduled: list[FlashscoreMatchRead], live: list[FlashscoreMatchRead]) -> list[FlashscoreMatchRead]:
    by_id = {match.event_id: match for match in scheduled}
    for live_match in live:
        previous = by_id.get(live_match.event_id)
        if previous:
            by_id[live_match.event_id] = previous.model_copy(
                update={
                    "status": live_match.status,
                    "minute": live_match.minute,
                    "home_score": live_match.home_score,
                    "away_score": live_match.away_score,
                    "start_time": previous.start_time or live_match.start_time,
                }
            )
        else:
            by_id[live_match.event_id] = live_match
    return list(by_id.values())


def _parse_odds_by_event(payload: Any) -> dict[str, tuple[float | None, float | None, float | None]]:
    odds: dict[str, tuple[float | None, float | None, float | None]] = {}
    for record in _walk_dicts(payload):
        event_id = _string_value(record, "match_id", "event_id", "eventId", "id")
        if not event_id:
            continue
        parsed = _extract_one_x_two(record)
        if parsed and (parsed[0] is not None or parsed[2] is not None):
            odds[event_id] = parsed
    return odds


def _extract_one_x_two(record: dict[str, Any]) -> tuple[float | None, float | None, float | None] | None:
    home = _float_value(record, "home_odds", "homeOdds", "odds_1", "home")
    draw = _float_value(record, "draw_odds", "drawOdds", "odds_x", "draw")
    away = _float_value(record, "away_odds", "awayOdds", "odds_2", "away")
    nested = record.get("odds")
    if isinstance(nested, dict):
        home = home or _float_value(nested, "home", "1", "odds_1")
        draw = draw or _float_value(nested, "draw", "x", "X", "odds_x")
        away = away or _float_value(nested, "away", "2", "odds_2")
    if isinstance(nested, list):
        selections: dict[str, float] = {}
        for item in nested:
            if not isinstance(item, dict):
                continue
            selection = _string_value(item, "selection", "name", "outcome")
            value = _float_value(item, "odds", "value", "current")
            if selection and value is not None:
                selections[selection.lower()] = value
        home = home or selections.get("home") or selections.get("1")
        draw = draw or selections.get("draw") or selections.get("x")
        away = away or selections.get("away") or selections.get("2")
    return (home, draw, away) if any(value is not None for value in (home, draw, away)) else None


def _with_odds_and_alert(
    match: FlashscoreMatchRead,
    odds: tuple[float | None, float | None, float | None] | None,
) -> FlashscoreMatchRead:
    home_odds, draw_odds, away_odds = odds or (None, None, None)
    candidates = [
        ("home", match.home_team, home_odds),
        ("away", match.away_team, away_odds),
    ]
    favorite = min((candidate for candidate in candidates if candidate[2] is not None), key=lambda item: item[2], default=None)
    if not favorite or favorite[2] is None or favorite[2] > ODDS_THRESHOLD:
        return match.model_copy(update={"home_odds": home_odds, "draw_odds": draw_odds, "away_odds": away_odds})
    favorite_side, favorite_team, favorite_odds = favorite
    favorite_score = match.home_score if favorite_side == "home" else match.away_score
    alert_eligible = match.minute is not None and match.minute <= 30 and (favorite_score or 0) > 0
    return match.model_copy(
        update={
            "home_odds": home_odds,
            "draw_odds": draw_odds,
            "away_odds": away_odds,
            "favorite_side": favorite_side,
            "favorite_team": favorite_team,
            "favorite_odds": favorite_odds,
            "alert_eligible": alert_eligible,
        }
    )


def _walk_dicts(value: Any):
    if isinstance(value, dict):
        yield value
        for nested in value.values():
            yield from _walk_dicts(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _walk_dicts(nested)


def _prefer_live(previous: FlashscoreMatchRead, candidate: FlashscoreMatchRead) -> FlashscoreMatchRead:
    previous_has_live = previous.minute is not None or previous.home_score is not None or previous.away_score is not None
    candidate_has_live = candidate.minute is not None or candidate.home_score is not None or candidate.away_score is not None
    return candidate if candidate_has_live and not previous_has_live else previous


def _team_name(record: dict[str, Any], side: str) -> str | None:
    for key in (f"{side}_team", f"{side}Team", f"{side}_participant", f"{side}Participant", side):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            name = _string_value(value, "name", "participant_name", "team_name")
            if name:
                return name
    return None


def _competition_name(record: dict[str, Any]) -> str:
    for key in ("competition", "tournament", "league"):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            name = _string_value(value, "name", "tournament_name", "league_name")
            if name:
                return name
    return _string_value(record, "competition_name", "tournament_name", "league_name") or "Flashscore"


def _score_value(record: dict[str, Any], side: str) -> int | None:
    value = _value(record, f"{side}_score", f"{side}Score", f"{side}_current_score")
    if value is None:
        score = record.get("score")
        if isinstance(score, dict):
            value = _value(score, side, f"{side}_score", "current")
    return _int_value(value)


def _minute_value(record: dict[str, Any]) -> int | None:
    value = _value(record, "minute", "live_time", "liveTime", "clock", "stage")
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        digits = "".join(character for character in value.split("+", 1)[0] if character.isdigit())
        return int(digits) if digits else None
    return None


def _datetime_value(record: dict[str, Any], *keys: str) -> datetime | None:
    value = _value(record, *keys)
    if isinstance(value, (int, float)):
        timestamp = value / 1000 if value > 10_000_000_000 else value
        return datetime.fromtimestamp(timestamp, UTC)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        except ValueError:
            return None
    return None


def _string_value(record: dict[str, Any], *keys: str) -> str | None:
    value = _value(record, *keys)
    if value is None or isinstance(value, (dict, list)):
        return None
    text = str(value).strip()
    return text or None


def _float_value(record: dict[str, Any], *keys: str) -> float | None:
    value = _value(record, *keys)
    if isinstance(value, dict):
        value = _value(value, "value", "odds", "current")
    try:
        parsed = float(str(value).replace(",", "."))
        return parsed if parsed > 1 else None
    except (TypeError, ValueError):
        return None


def _int_value(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _value(record: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in record and record[key] is not None:
            return record[key]
    return None
