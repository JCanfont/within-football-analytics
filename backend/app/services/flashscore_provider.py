from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime, timedelta
from typing import Any

import requests

from app.config import Settings, get_settings
from app.schemas.api import FlashscoreMatchRead, FlashscoreMatchesResult


ODDS_THRESHOLD = 1.5
FOOTBALL_SPORT_ID = 1
MAX_ODDS_LOOKUPS = 24
ODDS_LOOKAHEAD = timedelta(hours=4)


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
    payload_hint = _payload_hint(schedule_payload)
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

    odds_by_event = _fetch_odds_by_event(matches, headers, base_url, day)
    enriched = [_with_odds_and_alert(match, odds_by_event.get(match.event_id)) for match in matches]
    enriched.sort(key=lambda match: (match.start_time or datetime.max.replace(tzinfo=UTC), match.competition, match.home_team))
    qualifying = sum(match.favorite_odds is not None for match in enriched)
    with_odds = sum(match.home_odds is not None or match.away_odds is not None for match in enriched)
    return FlashscoreMatchesResult(
        status="ok",
        message=(
            f"{len(enriched)} partidos Flashscore · {with_odds} con cuotas cargadas · "
            f"{qualifying} con cuota de equipo igual o inferior a {ODDS_THRESHOLD:.2f}."
            f" · fuente {payload_hint}"
        ),
        configured=True,
        threshold=ODDS_THRESHOLD,
        matches=enriched,
    )


def probe_flashscore_feed(settings: Settings | None = None) -> dict[str, Any]:
    """Return a sanitized shape sample of upstream payloads for parser fixes."""
    settings = settings or get_settings()
    if not settings.rapidapi_key:
        return {"status": "not_configured"}
    headers = {
        "X-RapidAPI-Key": settings.rapidapi_key,
        "X-RapidAPI-Host": settings.flashscore_api_host,
        "Content-Type": "application/json",
    }
    base_url = f"https://{settings.flashscore_api_host}"
    result: dict[str, Any] = {"status": "ok"}
    for label, path, params in (
        ("list", "/api/flashscore/v2/matches/list", {"sport_id": FOOTBALL_SPORT_ID, "day": 0, "timezone": "Europe/Madrid"}),
        ("live", "/api/flashscore/v2/matches/live", {"sport_id": FOOTBALL_SPORT_ID, "timezone": "Europe/Madrid"}),
        ("bulk_odds", f"/api/livescores/sports/{FOOTBALL_SPORT_ID}/odds", {"dayOffset": 0, "lang": "en", "version": 2}),
    ):
        try:
            payload = _get_json(f"{base_url}{path}", headers, params)
            result[label] = _shape_summary(payload)
        except requests.RequestException as exc:
            result[label] = {"error": type(exc).__name__, "detail": str(exc)[:160]}

    list_shape = result.get("list")
    if isinstance(list_shape, dict) and "error" not in list_shape:
        try:
            list_payload = _get_json(
                f"{base_url}/api/flashscore/v2/matches/list",
                headers,
                {"sport_id": FOOTBALL_SPORT_ID, "day": 0, "timezone": "Europe/Madrid"},
            )
            matches = _parse_matches(list_payload)
            sample_id = matches[0].event_id if matches else None
            result["parsed_matches"] = len(matches)
            result["sample_match"] = matches[0].model_dump(mode="json") if matches else None
            if sample_id:
                try:
                    odds_payload = _get_json(
                        f"{base_url}/api/flashscore/v2/matches/odds",
                        headers,
                        {"match_id": sample_id, "geo_ip_code": "ES"},
                    )
                    result["match_odds"] = _shape_summary(odds_payload)
                except requests.RequestException as exc:
                    result["match_odds"] = {"error": type(exc).__name__, "detail": str(exc)[:160]}
        except requests.RequestException as exc:
            result["list_parse"] = {"error": type(exc).__name__, "detail": str(exc)[:160]}
    return result


def _payload_hint(payload: Any) -> str:
    if isinstance(payload, dict):
        keys = ",".join(sorted(payload.keys())[:12])
        return f"dict[{keys}]"
    if isinstance(payload, list):
        item = payload[0] if payload else None
        if isinstance(item, dict):
            return f"list[{len(payload)}]dict[{','.join(sorted(item.keys())[:12])}]"
        return f"list[{len(payload)}]{type(item).__name__ if item is not None else 'empty'}"
    return type(payload).__name__


def _shape_summary(value: Any, depth: int = 0) -> Any:
    if depth > 4:
        return "…"
    if isinstance(value, dict):
        summary: dict[str, Any] = {"_type": "dict", "_keys": sorted(value.keys())[:40], "_size": len(value)}
        for key in list(value.keys())[:8]:
            summary[key] = _shape_summary(value[key], depth + 1)
        return summary
    if isinstance(value, list):
        return {
            "_type": "list",
            "_size": len(value),
            "_item0": _shape_summary(value[0], depth + 1) if value else None,
        }
    if isinstance(value, str):
        return value[:80]
    return value


def _get_json(url: str, headers: dict[str, str], params: dict[str, Any]) -> Any:
    response = requests.get(url, headers=headers, params=params, timeout=12)
    response.raise_for_status()
    return response.json()


def _fetch_odds_by_event(
    matches: list[FlashscoreMatchRead],
    headers: dict[str, str],
    base_url: str,
    day: int,
) -> dict[str, tuple[float | None, float | None, float | None]]:
    odds_by_event: dict[str, tuple[float | None, float | None, float | None]] = {}

    try:
        odds_payload = _get_json(
            f"{base_url}/api/livescores/sports/{FOOTBALL_SPORT_ID}/odds",
            headers,
            {"dayOffset": day, "lang": "en", "version": 2},
        )
        odds_by_event.update(_parse_odds_by_event(odds_payload))
    except requests.RequestException:
        pass

    candidates = _odds_candidates(matches, already=set(odds_by_event))
    if not candidates:
        return odds_by_event

    def lookup(match: FlashscoreMatchRead) -> tuple[str, tuple[float | None, float | None, float | None]] | None:
        try:
            payload = _get_json(
                f"{base_url}/api/flashscore/v2/matches/odds",
                headers,
                {"match_id": match.event_id, "geo_ip_code": "ES"},
            )
        except requests.RequestException:
            return None
        parsed = _parse_odds_by_event(payload)
        if match.event_id in parsed:
            return match.event_id, parsed[match.event_id]
        extracted = _extract_one_x_two(payload if isinstance(payload, dict) else {})
        if extracted and any(value is not None for value in extracted):
            return match.event_id, extracted
        for record in _walk_dicts(payload):
            extracted = _extract_one_x_two(record)
            if extracted and (extracted[0] is not None or extracted[2] is not None):
                return match.event_id, extracted
        return None

    workers = min(6, len(candidates))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(lookup, match) for match in candidates]
        for future in as_completed(futures):
            result = future.result()
            if result:
                event_id, values = result
                odds_by_event[event_id] = values
    return odds_by_event


def _odds_candidates(
    matches: list[FlashscoreMatchRead],
    already: set[str],
) -> list[FlashscoreMatchRead]:
    now = datetime.now(UTC)
    prioritized: list[tuple[int, datetime, FlashscoreMatchRead]] = []
    for match in matches:
        if match.event_id in already:
            continue
        start = match.start_time if match.start_time and match.start_time.tzinfo else (
            match.start_time.replace(tzinfo=UTC) if match.start_time else None
        )
        live = (
            match.minute is not None
            or match.home_score is not None
            or match.away_score is not None
            or any(token in (match.status or "").lower() for token in ("live", "1st", "2nd", "half", "progress"))
        )
        soon = bool(start and now - timedelta(minutes=20) <= start <= now + ODDS_LOOKAHEAD)
        if live:
            prioritized.append((0, start or now, match))
        elif soon:
            prioritized.append((1, start or now, match))
        elif start and start >= now - timedelta(minutes=20):
            prioritized.append((2, start, match))
    prioritized.sort(key=lambda item: (item[0], item[1]))
    return [item[2] for item in prioritized[:MAX_ODDS_LOOKUPS]]


def _parse_matches(payload: Any) -> list[FlashscoreMatchRead]:
    matches: dict[str, FlashscoreMatchRead] = {}
    _collect_matches(payload, matches, competition=None)
    return list(matches.values())


def _collect_matches(
    value: Any,
    matches: dict[str, FlashscoreMatchRead],
    competition: str | None,
) -> None:
    if isinstance(value, list):
        for item in value:
            _collect_matches(item, matches, competition)
        return
    if not isinstance(value, dict):
        return

    local_competition = _competition_name(value)
    inherited = local_competition if local_competition != "Flashscore" else competition

    event_id = _string_value(value, "match_id", "event_id", "eventId", "id")
    home_team = _team_name(value, "home")
    away_team = _team_name(value, "away")
    if event_id and home_team and away_team and _looks_like_match_record(value):
        candidate = FlashscoreMatchRead(
            event_id=event_id,
            start_time=_datetime_value(value, "start_time", "startTime", "timestamp", "start_timestamp"),
            competition=inherited or "Flashscore",
            home_team=home_team,
            away_team=away_team,
            status=_normalize_status(_string_value(value, "stage", "status", "state") or "scheduled"),
            minute=_minute_value(value),
            home_score=_score_value(value, "home"),
            away_score=_score_value(value, "away"),
        )
        previous = matches.get(event_id)
        matches[event_id] = _prefer_live(previous, candidate) if previous else candidate

    for nested in value.values():
        _collect_matches(nested, matches, inherited)


def _looks_like_match_record(record: dict[str, Any]) -> bool:
    if any(key in record for key in ("home_team", "away_team", "homeTeam", "awayTeam", "home", "away")):
        return True
    return "match_id" in record or "event_id" in record or "eventId" in record


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
                    "competition": previous.competition if previous.competition != "Flashscore" else live_match.competition,
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
    home = _float_value(record, "home_odds", "homeOdds", "odds_1", "odd_1", "home")
    draw = _float_value(record, "draw_odds", "drawOdds", "odds_x", "odd_x", "draw")
    away = _float_value(record, "away_odds", "awayOdds", "odds_2", "odd_2", "away")
    nested = record.get("odds") or record.get("data") or record.get("market")
    if isinstance(nested, dict):
        home = home or _float_value(nested, "home", "1", "odds_1", "odd_1", "HOME")
        draw = draw or _float_value(nested, "draw", "x", "X", "odds_x", "odd_x", "DRAW")
        away = away or _float_value(nested, "away", "2", "odds_2", "odd_2", "AWAY")
        for key in ("full_time", "fullTime", "1x2", "match_winner", "matchWinner"):
            market = nested.get(key)
            if isinstance(market, dict):
                home = home or _float_value(market, "home", "1", "odds_1")
                draw = draw or _float_value(market, "draw", "x", "X", "odds_x")
                away = away or _float_value(market, "away", "2", "odds_2")
    if isinstance(nested, list):
        selections: dict[str, float] = {}
        for item in nested:
            if not isinstance(item, dict):
                continue
            selection = _string_value(item, "selection", "name", "outcome", "label", "type")
            value = _float_value(item, "odds", "value", "current", "price")
            if selection and value is not None:
                selections[selection.lower()] = value
        home = home or selections.get("home") or selections.get("1") or selections.get("home win")
        draw = draw or selections.get("draw") or selections.get("x")
        away = away or selections.get("away") or selections.get("2") or selections.get("away win")
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
    chosen = candidate if candidate_has_live and not previous_has_live else previous
    if chosen.competition == "Flashscore" and candidate.competition != "Flashscore":
        return chosen.model_copy(update={"competition": candidate.competition})
    if chosen.competition == "Flashscore" and previous.competition != "Flashscore":
        return chosen.model_copy(update={"competition": previous.competition})
    return chosen


def _team_name(record: dict[str, Any], side: str) -> str | None:
    for key in (f"{side}_team", f"{side}Team", f"{side}_participant", f"{side}Participant", side):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            name = _string_value(value, "name", "participant_name", "team_name")
            if name:
                return name
    return _string_value(record, f"{side}_name", f"{side}Name")


def _competition_name(record: dict[str, Any]) -> str:
    for key in ("competition", "tournament", "league", "category"):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            name = _string_value(value, "name", "tournament_name", "league_name", "competition_name")
            if name:
                return name
    return _string_value(record, "competition_name", "tournament_name", "league_name", "tournamentName") or "Flashscore"


def _score_value(record: dict[str, Any], side: str) -> int | None:
    value = _value(record, f"{side}_score", f"{side}Score", f"{side}_current_score", f"{side}_result")
    if value is None:
        score = record.get("score") or record.get("result")
        if isinstance(score, dict):
            value = _value(score, side, f"{side}_score", "current")
    return _int_value(value)


def _minute_value(record: dict[str, Any]) -> int | None:
    value = _value(record, "minute", "live_time", "liveTime", "clock", "time")
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        digits = "".join(character for character in value.split("+", 1)[0] if character.isdigit())
        return int(digits) if digits else None
    stage = record.get("stage")
    if isinstance(stage, str):
        digits = "".join(character for character in stage.split("+", 1)[0] if character.isdigit())
        return int(digits) if digits else None
    return None


def _normalize_status(status: str) -> str:
    lowered = status.lower()
    if any(token in lowered for token in ("live", "1st", "2nd", "half", "progress")):
        return "live"
    if any(token in lowered for token in ("finish", "ended", "ft", "aet", "pen")):
        return "finished"
    return status


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
        value = _value(value, "value", "odds", "current", "price")
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
