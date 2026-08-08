from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import requests

from app.config import Settings, get_settings
from app.schemas.api import FlashscoreMatchRead, FlashscoreMatchesResult


LIST_ODDS_THRESHOLD = 1.6
ALERT_ODDS_THRESHOLD = 1.5
ODDS_THRESHOLD = LIST_ODDS_THRESHOLD  # favorite marking / jornada list
FOOTBALL_SPORT_ID = 1
MAX_ODDS_LOOKUPS = 0  # list payload already includes 1X2; Ultra plan is used for live ticks
ODDS_LOOKAHEAD = timedelta(hours=4)
# Odds capture can reuse a short board; live refresh uses a tighter TTL.
CACHE_TTL = timedelta(minutes=8)
LIVE_CACHE_TTL = timedelta(seconds=45)
STALE_TTL = timedelta(hours=6)
_RESULT_CACHE: dict[int, tuple[datetime, FlashscoreMatchesResult]] = {}
_BOARD_CACHE: dict[int, tuple[datetime, list[FlashscoreMatchRead]]] = {}

_NON_COMPETITIVE_TOKENS = (
    "friendly",
    "amistoso",
    "women",
    "femen",
    "womens",
    "women's",
    "u15",
    "u16",
    "u17",
    "u18",
    "u19",
    "u20",
    "u21",
    "u23",
    "youth",
    "reserve",
    "junior",
    "next pro",
)
FINISHED_WITHOUT_CLOCK = timedelta(minutes=105)


def fetch_flashscore_matches(
    day: int = 0,
    settings: Settings | None = None,
    *,
    bypass_cache: bool = False,
) -> FlashscoreMatchesResult:
    settings = settings or get_settings()
    if not settings.rapidapi_key:
        return FlashscoreMatchesResult(
            status="not_configured",
            message="Flashscore necesita RAPIDAPI_KEY.",
            configured=False,
        )

    cached = _RESULT_CACHE.get(day)
    now = datetime.now(UTC)
    if (
        not bypass_cache
        and cached
        and now - cached[0] < CACHE_TTL
        and cached[1].status == "ok"
    ):
        return cached[1]

    try:
        board = _load_day_board(day, settings)
    except requests.RequestException as exc:
        if cached and cached[1].status == "ok" and now - cached[0] < STALE_TTL:
            stale = cached[1]
            return stale.model_copy(
                update={
                    "message": (
                        f"Mostrando ultima captura (RapidAPI no disponible ahora). "
                        f"{stale.message}"
                    )
                }
            )
        return FlashscoreMatchesResult(
            status="request_failed",
            message=_request_error_message(exc),
            configured=True,
        )

    enriched = [_ensure_odds_marking(match) for match in board]
    enriched.sort(key=lambda match: (match.start_time or datetime.max.replace(tzinfo=UTC), match.competition, match.home_team))
    with_odds = sum(match.home_odds is not None or match.away_odds is not None for match in enriched)
    favorites = [
        match
        for match in enriched
        if match.favorite_odds is not None and _is_competitive_match(match)
    ]
    finished = 0
    listed: list[FlashscoreMatchRead] = []
    for match in favorites:
        if _is_match_finished_for_list(match, now):
            finished += 1
            continue
        listed.append(match)
    result = FlashscoreMatchesResult(
        status="ok",
        message=(
            f"{len(listed)} favoritos ≤ {LIST_ODDS_THRESHOLD:.2f} vigilables "
            f"(de {len(enriched)} en jornada · {with_odds} con alguna cuota · "
            f"{finished} acabados excluidos). "
            "Solo se guardan ≤ 1.60 no acabados; senales solo tras inicio real."
        ),
        configured=True,
        threshold=LIST_ODDS_THRESHOLD,
        alert_threshold=ALERT_ODDS_THRESHOLD,
        matches=listed,
    )
    _RESULT_CACHE[day] = (now, result)
    return result


def fetch_flashscore_live_board(
    day: int = 0,
    settings: Settings | None = None,
    *,
    bypass_cache: bool = True,
) -> list[FlashscoreMatchRead]:
    """Full day board for live score/minute updates (not filtered by ≤1.60)."""
    settings = settings or get_settings()
    if not settings.rapidapi_key:
        raise RuntimeError("Flashscore necesita RAPIDAPI_KEY.")
    if bypass_cache:
        _BOARD_CACHE.pop(day, None)
    return _load_day_board(day, settings)


def _load_day_board(
    day: int,
    settings: Settings,
) -> list[FlashscoreMatchRead]:
    cached = _BOARD_CACHE.get(day)
    now = datetime.now(UTC)
    # Board is always short-lived; the filtered ≤1.60 result uses CACHE_TTL separately.
    if cached and now - cached[0] < LIVE_CACHE_TTL:
        return cached[1]

    headers = {
        "X-RapidAPI-Key": settings.rapidapi_key,
        "X-RapidAPI-Host": settings.flashscore_api_host,
        "Content-Type": "application/json",
    }
    base_url = f"https://{settings.flashscore_api_host}"
    schedule_payload = _load_schedule_payload(base_url, headers, day)
    matches = [_ensure_odds_marking(match) for match in _parse_matches(schedule_payload)]
    _BOARD_CACHE[day] = (now, matches)
    return matches


def _ensure_odds_marking(match: FlashscoreMatchRead) -> FlashscoreMatchRead:
    if match.home_odds is None and match.away_odds is None and match.draw_odds is None:
        return match
    if match.favorite_odds is not None:
        return match
    return _with_odds_and_alert(match, (match.home_odds, match.draw_odds, match.away_odds))


def _is_competitive_match(match: FlashscoreMatchRead) -> bool:
    haystack = " ".join(
        part
        for part in (match.competition, match.home_team, match.away_team)
        if part
    ).lower()
    return not any(token in haystack for token in _NON_COMPETITIVE_TOKENS)


def _is_match_finished_for_list(match: FlashscoreMatchRead, now: datetime | None = None) -> bool:
    status = (match.status or "").lower().strip()
    if status in {"finished", "ft", "aet", "ap"} or any(
        token in status
        for token in (
            "finish",
            "ended",
            "final",
            "full time",
            "after extra",
            "after pen",
            "penalties",
            "awarded",
            "abandoned",
            "cancelled",
            "canceled",
            "postponed",
            "walkover",
            "retired",
            "closed",
        )
    ):
        return True
    if match.minute is not None:
        return False
    if match.start_time is None:
        return False
    current = now or datetime.now(UTC)
    start = match.start_time
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    return current >= start + FINISHED_WITHOUT_CLOCK


def _load_schedule_payload(base_url: str, headers: dict[str, str], day: int) -> Any:
    try:
        return _get_json(
            f"{base_url}/api/flashscore/v2/matches/list",
            headers,
            {"sport_id": FOOTBALL_SPORT_ID, "day": day, "timezone": "Europe/Madrid"},
        )
    except requests.HTTPError as exc:
        # Fallback used by some FlashScore4 plans / endpoints.
        if exc.response is None or exc.response.status_code not in {400, 404, 422}:
            raise
    # Keep calendar day aligned with Europe/Madrid like the primary feed.
    madrid_day = datetime.now(ZoneInfo("Europe/Madrid")).date() + timedelta(days=day)
    return _get_json(
        f"{base_url}/api/flashscore/v2/matches/list-by-date",
        headers,
        {
            "sport_id": FOOTBALL_SPORT_ID,
            "date": madrid_day.isoformat(),
            "timezone": "Europe/Madrid",
        },
    )


def _get_json(url: str, headers: dict[str, str], params: dict[str, Any]) -> Any:
    response = requests.get(url, headers=headers, params=params, timeout=12)
    if not response.ok:
        detail = ""
        try:
            payload = response.json()
            if isinstance(payload, dict):
                detail = str(payload.get("message") or payload.get("error") or payload.get("detail") or "")
        except ValueError:
            detail = (response.text or "")[:180]
        raise requests.HTTPError(
            f"{response.status_code} {detail or response.reason}",
            response=response,
        )
    return response.json()


def _request_error_message(exc: requests.RequestException) -> str:
    text = str(exc)
    lowered = text.lower()
    if "not subscribed" in lowered or "you are not subscribed" in lowered:
        return (
            "No se pueden cargar las cuotas 1X2: RapidAPI no tiene suscripcion activa a FlashScore4. "
            "Abre rapidapi.com/flashscore4, pulsa Subscribe y revisa RAPIDAPI_KEY en Vercel."
        )
    if "429" in text or "rate limit" in lowered or "too many requests" in lowered or "quota" in lowered:
        return (
            "No se pueden cargar las cuotas 1X2: RapidAPI ha bloqueado el acceso por exceso de peticiones. "
            "Espera a que se renueve el limite del plan FlashScore4 o sube de plan; luego pulsa Actualizar."
        )
    if "401" in text or "403" in text or "invalid" in lowered:
        return (
            "No se pueden cargar las cuotas 1X2: RapidAPI rechazo la clave. "
            "Comprueba RAPIDAPI_KEY en Vercel y que la suscripcion a FlashScore4 siga activa."
        )
    return f"No se pueden cargar las cuotas 1X2 desde Flashscore ({text[:160]})."


def _fetch_odds_by_event(
    matches: list[FlashscoreMatchRead],
    headers: dict[str, str],
    base_url: str,
    day: int,
) -> dict[str, tuple[float | None, float | None, float | None]]:
    odds_by_event: dict[str, tuple[float | None, float | None, float | None]] = {}
    # Avoid the bulk livescores odds endpoint: it burns RapidAPI quota and is often unavailable.
    missing = [match for match in matches if match.home_odds is None and match.away_odds is None]
    candidates = _odds_candidates(missing, already=set(odds_by_event))
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
        embedded_odds = _extract_one_x_two(value) or _extract_odds_from_bookmakers(value.get("odds"))
        home_odds = embedded_odds[0] if embedded_odds else None
        draw_odds = embedded_odds[1] if embedded_odds else None
        away_odds = embedded_odds[2] if embedded_odds else None
        candidate = FlashscoreMatchRead(
            event_id=event_id,
            start_time=_datetime_value(value, "start_time", "startTime", "timestamp", "start_timestamp"),
            competition=inherited or "Flashscore",
            home_team=home_team,
            away_team=away_team,
            status=_status_value(value),
            minute=_minute_value(value),
            home_score=_score_value(value, "home"),
            away_score=_score_value(value, "away"),
            home_odds=home_odds,
            draw_odds=draw_odds,
            away_odds=away_odds,
        )
        if any(value is not None for value in (home_odds, draw_odds, away_odds)):
            candidate = _with_odds_and_alert(candidate, (home_odds, draw_odds, away_odds))
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
    home = _float_value(record, "home_odds", "homeOdds", "odds_1", "odd_1")
    draw = _float_value(record, "draw_odds", "drawOdds", "odds_x", "odd_x")
    away = _float_value(record, "away_odds", "awayOdds", "odds_2", "odd_2")
    nested = record.get("odds") or record.get("data") or record.get("market")
    from_bookmakers = _extract_odds_from_bookmakers(nested)
    if from_bookmakers:
        home = home or from_bookmakers[0]
        draw = draw or from_bookmakers[1]
        away = away or from_bookmakers[2]
    if isinstance(nested, dict):
        # Never treat market averages ("avg"/"average") as the home odd itself.
        home = home or _float_value(nested, "home", "1", "odds_1", "odd_1", "HOME")
        draw = draw or _float_value(nested, "draw", "x", "X", "odds_x", "odd_x", "DRAW")
        away = away or _float_value(nested, "away", "2", "odds_2", "odd_2", "AWAY")
        # FlashScore4 often nests 1X2 as {"1": "...", "X": "...", "2": "..."} or lists under keys.
        home = home or _coerce_odd(nested.get("1"))
        draw = draw or _coerce_odd(nested.get("X") if "X" in nested else nested.get("x"))
        away = away or _coerce_odd(nested.get("2"))
        for key in ("full_time", "fullTime", "1x2", "match_winner", "matchWinner", "avg", "average"):
            market = nested.get(key)
            if isinstance(market, dict):
                home = home or _float_value(market, "home", "1", "odds_1") or _coerce_odd(market.get("1"))
                draw = draw or _float_value(market, "draw", "x", "X", "odds_x") or _coerce_odd(market.get("X") or market.get("x"))
                away = away or _float_value(market, "away", "2", "odds_2") or _coerce_odd(market.get("2"))
            elif isinstance(market, list) and len(market) >= 3:
                home = home or _coerce_odd(market[0])
                draw = draw or _coerce_odd(market[1])
                away = away or _coerce_odd(market[2])
            # Scalar avg/average values are bookmaker means, not a 1X2 selection.
    if isinstance(nested, list) and nested and not isinstance(nested[0], dict):
        # Plain [home, draw, away] list
        if len(nested) >= 3:
            home = home or _coerce_odd(nested[0])
            draw = draw or _coerce_odd(nested[1])
            away = away or _coerce_odd(nested[2])
    elif isinstance(nested, list):
        selections: dict[str, float] = {}
        for item in nested:
            if not isinstance(item, dict):
                continue
            # Skip bookmaker wrappers; handled above.
            if "odds" in item and ("name" in item or "image" in item):
                continue
            selection = _string_value(item, "selection", "name", "outcome", "label", "type")
            value = _float_value(item, "odds", "value", "current", "price")
            if selection and value is not None:
                selections[selection.lower()] = value
        home = home or selections.get("home") or selections.get("1") or selections.get("home win")
        draw = draw or selections.get("draw") or selections.get("x")
        away = away or selections.get("away") or selections.get("2") or selections.get("away win")
    return (home, draw, away) if any(value is not None for value in (home, draw, away)) else None


def _extract_odds_from_bookmakers(value: Any) -> tuple[float | None, float | None, float | None] | None:
    if not isinstance(value, list):
        return None
    for item in value:
        if not isinstance(item, dict):
            continue
        nested = item.get("odds")
        parsed = None
        if isinstance(nested, dict):
            parsed = (
                _float_value(nested, "home", "1", "odds_1") or _coerce_odd(nested.get("1")),
                _float_value(nested, "draw", "x", "X", "odds_x") or _coerce_odd(nested.get("X") or nested.get("x")),
                _float_value(nested, "away", "2", "odds_2") or _coerce_odd(nested.get("2")),
            )
        elif isinstance(nested, list) and len(nested) >= 3:
            parsed = (_coerce_odd(nested[0]), _coerce_odd(nested[1]), _coerce_odd(nested[2]))
        if parsed and any(part is not None for part in parsed):
            return parsed
    return None


def _coerce_odd(value: Any) -> float | None:
    if isinstance(value, dict):
        value = _value(value, "value", "odds", "current", "price", "avg", "average")
    try:
        parsed = float(str(value).replace(",", "."))
        return parsed if parsed > 1 else None
    except (TypeError, ValueError):
        return None


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
    if not favorite or favorite[2] is None or favorite[2] > LIST_ODDS_THRESHOLD:
        return match.model_copy(update={"home_odds": home_odds, "draw_odds": draw_odds, "away_odds": away_odds})
    favorite_side, favorite_team, favorite_odds = favorite
    favorite_score = match.home_score if favorite_side == "home" else match.away_score
    alert_eligible = (
        favorite_odds <= ALERT_ODDS_THRESHOLD
        and match.minute is not None
        and match.minute <= 30
        and (favorite_score or 0) > 0
    )
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
    named = _string_value(record, "competition_name", "tournament_name", "league_name", "tournamentName")
    if named:
        return named
    # FlashScore4 lists tournaments as {name, tournament_id, matches:[...]}
    if ("matches" in record or "events" in record) and isinstance(record.get("name"), str) and record["name"].strip():
        return record["name"].strip()
    return "Flashscore"


def _score_value(record: dict[str, Any], side: str) -> int | None:
    value = _value(record, f"{side}_score", f"{side}Score", f"{side}_current_score", f"{side}_result")
    if value is None:
        score = record.get("score") or record.get("scores") or record.get("result")
        if isinstance(score, dict):
            value = _value(score, side, f"{side}_score", "current", "regular")
            if value is None and isinstance(score.get("current"), dict):
                value = _value(score["current"], side)
        elif isinstance(score, list) and len(score) >= 2:
            value = score[0] if side == "home" else score[1]
    return _int_value(value)


def _minute_value(record: dict[str, Any]) -> int | None:
    # Avoid generic "time" — Flashscore often stores kickoff timestamps there.
    value = _value(record, "minute", "live_time", "liveTime", "clock", "match_time", "game_time")
    parsed = _parse_minute_candidate(value)
    if parsed is not None:
        return parsed
    stage = record.get("stage") or record.get("match_status")
    return _parse_minute_candidate(stage)


def _parse_minute_candidate(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        minute = int(value)
        return minute if 0 <= minute <= 130 else None
    if not isinstance(value, str):
        return None
    text = value.strip().lower()
    if not text or ("-" in text and "t" in text):
        # ISO timestamps like 2026-08-08t20:00:00z are not live minutes.
        return None
    if ":" in text and len(text) >= 4 and not text.endswith("'"):
        # Kickoff clock like 20:00, not a live minute.
        return None
    digits = "".join(character for character in text.split("+", 1)[0] if character.isdigit())
    if not digits:
        return None
    minute = int(digits)
    return minute if 0 <= minute <= 130 else None


def _status_value(record: dict[str, Any]) -> str:
    if record.get("is_finished") is True or record.get("isFinished") is True:
        return "finished"
    if record.get("is_in_progress") is True or record.get("isInProgress") is True:
        return "live"
    if record.get("is_started") is False or record.get("isStarted") is False:
        raw = _string_value(record, "match_status", "stage", "status", "state")
        return _normalize_status(raw or "scheduled")
    raw = _string_value(record, "match_status", "stage", "status", "state")
    return _normalize_status(raw or "scheduled")


def _normalize_status(status: str) -> str:
    lowered = status.lower().strip()
    if lowered in {"ft", "aet", "ap", "pen", "pen."}:
        return "finished"
    if any(
        token in lowered
        for token in (
            "finish",
            "ended",
            "final",
            "full time",
            "fulltime",
            "after extra",
            "after pen",
            "penalties",
            "awarded",
            "abandoned",
            "cancelled",
            "canceled",
            "postponed",
            "walkover",
            "retired",
            "closed",
        )
    ):
        return "finished"
    if any(token in lowered for token in ("live", "1st", "2nd", "half", "progress", "inplay", "in play")):
        return "live"
    return status or "scheduled"


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
