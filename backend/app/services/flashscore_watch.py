from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import StatisticalConfig
from app.schemas.api import (
    FlashscoreGoalEmailRequest,
    FlashscoreMatchRead,
    FlashscoreTickResult,
    FlashscoreWatchState,
    SofaScoreTeamEvent,
)
from app.services.email_alerts import send_flashscore_goal_email
from app.services.flashscore_competition_filter import is_watchable_competition
from app.services.flashscore_provider import (
    LIST_ODDS_THRESHOLD,
    enrich_matches_with_details,
    enrich_matches_with_goal_minutes,
    fetch_flashscore_live_board,
)
from app.utils.team_match import same_team


FLASHSCORE_WATCH_KEY = "flashscore_watch"
ALERT_ODDS_THRESHOLD = 1.5
EARLY_GOAL_MINUTE = 30
SLOW_LIVE_POLL = timedelta(minutes=5)
# If Flashscore leaves status as "scheduled" with scores but no minute, stop after this.
FINISHED_WITHOUT_CLOCK = timedelta(minutes=105)


def save_flashscore_watch(
    db: Session,
    *,
    day: int,
    captured_at: datetime | None,
    matches: list[FlashscoreMatchRead],
    last_live_poll_at: datetime | None = None,
) -> FlashscoreWatchState:
    stamp = captured_at or datetime.now(UTC)
    watched = [match for match in matches if _is_watchable(match)]
    previous = load_flashscore_watch(db)
    poll_stamp = last_live_poll_at
    if poll_stamp is None and previous is not None:
        poll_stamp = previous.last_live_poll_at
    payload = {
        "day": day,
        "captured_at": stamp.isoformat(),
        "matches": [match.model_dump(mode="json") for match in watched],
        "updated_at": datetime.now(UTC).isoformat(),
        "last_live_poll_at": poll_stamp.isoformat() if poll_stamp else None,
    }
    config = db.scalar(select(StatisticalConfig).where(StatisticalConfig.key == FLASHSCORE_WATCH_KEY))
    if not config:
        config = StatisticalConfig(
            key=FLASHSCORE_WATCH_KEY,
            description="Flashscore ≤1.60 watchlist for Ultra live ticks.",
            value=payload,
        )
        db.add(config)
    else:
        config.value = payload
        config.description = "Flashscore ≤1.60 watchlist for Ultra live ticks."
    db.commit()
    db.refresh(config)
    return _watch_from_payload(config.value)


def load_flashscore_watch(db: Session) -> FlashscoreWatchState | None:
    config = db.scalar(select(StatisticalConfig).where(StatisticalConfig.key == FLASHSCORE_WATCH_KEY))
    if not config or not isinstance(config.value, dict):
        return None
    return _watch_from_payload(config.value)


def clear_flashscore_watch(db: Session) -> None:
    config = db.scalar(select(StatisticalConfig).where(StatisticalConfig.key == FLASHSCORE_WATCH_KEY))
    if not config:
        return
    config.value = {
        "day": 0,
        "captured_at": None,
        "matches": [],
        "updated_at": datetime.now(UTC).isoformat(),
        "last_live_poll_at": None,
    }
    db.commit()


def merge_flashscore_live_board(
    matches: list[FlashscoreMatchRead],
    board: list[FlashscoreMatchRead],
) -> list[FlashscoreMatchRead]:
    """Merge live minute/score from Flashscore board into a sticky ≤1.60 watchlist."""
    by_id = {match.event_id: match for match in board}
    merged: list[FlashscoreMatchRead] = []
    now = datetime.now(UTC)
    for match in matches:
        live = by_id.get(match.event_id)
        data = match.model_dump()
        previous_total = (match.home_score or 0) + (match.away_score or 0)
        if live is not None:
            data["status"] = live.status or match.status
            data["minute"] = live.minute if live.minute is not None else match.minute
            data["home_score"] = live.home_score if live.home_score is not None else match.home_score
            data["away_score"] = live.away_score if live.away_score is not None else match.away_score
            # Keep captured prematch odds / favorite sticky on the watchlist.
            if live.early_goal_minute is not None:
                previous = data.get("early_goal_minute")
                data["early_goal_minute"] = (
                    live.early_goal_minute
                    if previous is None
                    else min(int(previous), int(live.early_goal_minute))
                )
        next_total = (data.get("home_score") or 0) + (data.get("away_score") or 0)
        minute = data.get("minute")
        # Stamp the live clock when the scoreline first moves inside the early window.
        if (
            data.get("early_goal_minute") is None
            and next_total > previous_total
            and isinstance(minute, int)
            and minute <= EARLY_GOAL_MINUTE
        ):
            data["early_goal_minute"] = minute
        stamped = FlashscoreMatchRead.model_validate(data)
        if is_match_finished(stamped, now) and (stamped.status or "").lower() != "finished":
            stamped = stamped.model_copy(update={"status": "finished", "minute": None if stamped.minute is None else stamped.minute})
        merged.append(with_early_goal_flags(stamped))
    return merged


def merge_flashscore_with_sofascore(
    matches: list[FlashscoreMatchRead],
    events: list[SofaScoreTeamEvent],
) -> list[FlashscoreMatchRead]:
    """Legacy SofaScore merge kept for tests; live path uses Flashscore Ultra."""
    merged: list[FlashscoreMatchRead] = []
    for match in matches:
        event = next(
            (
                candidate
                for candidate in events
                if same_team(match.home_team, candidate.home_team)
                and same_team(match.away_team, candidate.away_team)
            ),
            None,
        )
        data = match.model_dump()
        if event is not None:
            data["status"] = event.status or match.status
            data["minute"] = event.minute if event.minute is not None else match.minute
            data["home_score"] = event.home_score if event.home_score is not None else match.home_score
            data["away_score"] = event.away_score if event.away_score is not None else match.away_score
        merged.append(with_early_goal_flags(FlashscoreMatchRead.model_validate(data)))
    return merged


def with_early_goal_flags(match: FlashscoreMatchRead) -> FlashscoreMatchRead:
    minute = match.minute
    home_score = match.home_score or 0
    away_score = match.away_score or 0
    total_goals = home_score + away_score
    favorite_score = away_score if match.favorite_side == "away" else home_score
    in_early_window = minute is not None and minute <= EARLY_GOAL_MINUTE
    early_goal_minute = match.early_goal_minute
    if early_goal_minute is None and in_early_window and total_goals > 0:
        early_goal_minute = minute
    known_early_goal = early_goal_minute is not None and early_goal_minute <= EARLY_GOAL_MINUTE
    saw_early_goal = bool(match.early_goal) or known_early_goal or (in_early_window and total_goals > 0)
    saw_early_favorite_goal = bool(match.early_favorite_goal) or (
        (
            known_early_goal or in_early_window
        )
        and match.favorite_team is not None
        and match.favorite_odds is not None
        and match.favorite_odds <= ALERT_ODDS_THRESHOLD
        and favorite_score > 0
    )
    flagged = match.model_copy(
        update={
            "early_goal": saw_early_goal,
            "early_favorite_goal": saw_early_favorite_goal,
            "early_goal_minute": early_goal_minute,
        }
    )
    return flagged.model_copy(
        update={"alert_eligible": saw_early_favorite_goal or is_alert_eligible(flagged)}
    )


def is_alert_eligible(match: FlashscoreMatchRead) -> bool:
    if not has_match_started(match):
        return False
    if match.early_favorite_goal:
        return True
    if (
        not match.favorite_team
        or match.favorite_odds is None
        or match.favorite_odds > ALERT_ODDS_THRESHOLD
        or match.minute is None
        or match.minute > EARLY_GOAL_MINUTE
        or match.home_score is None
        or match.away_score is None
    ):
        return False
    favorite_score = match.away_score if match.favorite_side == "away" else match.home_score
    return (favorite_score or 0) > 0


def is_match_finished(match: FlashscoreMatchRead, now: datetime | None = None) -> bool:
    """Detect finished matches even when Flashscore leaves status as scheduled."""
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
    # With a scoreline but no clock, wait longer before assuming FT (list feed is sticky).
    grace = FINISHED_WITHOUT_CLOCK
    if match.home_score is not None or match.away_score is not None:
        grace = timedelta(minutes=150)
    return current >= start + grace


def has_match_started(match: FlashscoreMatchRead, now: datetime | None = None) -> bool:
    """True with live evidence, scores, or once the scheduled kickoff time has passed."""
    current = now or datetime.now(UTC)
    if is_match_finished(match, current):
        return False
    if match.minute is not None:
        return True
    if match.home_score is not None or match.away_score is not None:
        return True
    status = (match.status or "").lower()
    if any(
        token in status
        for token in ("live", "1st", "2nd", "half", "halftime", "progress", "inplay", "in play", "ht")
    ):
        return True
    # Flashscore often keeps status=scheduled after kickoff; the clock is enough.
    return is_past_kickoff(match, current)


def is_half_time(match: FlashscoreMatchRead) -> bool:
    status = (match.status or "").lower().strip()
    if status in {"halftime", "ht", "break", "pause", "paused"}:
        return True
    if "half time" in status or "half-time" in status or "halftime" in status:
        return True
    if "half" in status and not any(token in status for token in ("1st", "2nd", "first", "second")):
        return True
    return False


def is_past_kickoff(match: FlashscoreMatchRead, now: datetime | None = None) -> bool:
    if match.start_time is None:
        return False
    current = now or datetime.now(UTC)
    start = match.start_time
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    return current >= start


def _minutes_since_kickoff(match: FlashscoreMatchRead, now: datetime) -> float | None:
    if match.start_time is None:
        return None
    start = match.start_time
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    return (now - start).total_seconds() / 60.0


def needs_live_poll(match: FlashscoreMatchRead, now: datetime | None = None) -> bool:
    """Poll once the match has started (kickoff time or live data); never before."""
    if match.favorite_odds is None or match.favorite_odds > LIST_ODDS_THRESHOLD:
        return False
    current = now or datetime.now(UTC)
    if is_match_finished(match, current):
        return False
    return has_match_started(match, current)


def needs_fast_live_poll(match: FlashscoreMatchRead, now: datetime | None = None) -> bool:
    """1-minute cadence in the early-goal window (live minute or elapsed since kickoff)."""
    if not needs_live_poll(match, now):
        return False
    if match.early_favorite_goal or match.alert_eligible:
        return False
    current = now or datetime.now(UTC)
    if match.minute is not None:
        return match.minute <= EARLY_GOAL_MINUTE
    elapsed = _minutes_since_kickoff(match, current)
    if elapsed is not None:
        return elapsed <= EARLY_GOAL_MINUTE
    return True


def run_flashscore_signal_tick(db: Session, settings: Settings | None = None) -> FlashscoreTickResult:
    settings = settings or get_settings()
    watch = load_flashscore_watch(db)
    if watch is None or not watch.matches:
        return FlashscoreTickResult(
            status="no_watch",
            checked=0,
            eligible=0,
            emails_sent=0,
            message="No hay lista vigilada. Captura solo favoritos ≤ 1,60 en la web para activar el tick Ultra.",
        )

    if not settings.rapidapi_key:
        return FlashscoreTickResult(
            status="provider_not_configured",
            checked=len(watch.matches),
            eligible=0,
            emails_sent=0,
            message="Falta RAPIDAPI_KEY para revisar marcadores con Flashscore Ultra.",
        )

    now = datetime.now(UTC)
    stamped_watch = []
    finished_stamped = 0
    for match in watch.matches:
        if is_match_finished(match, now) and (match.status or "").lower() != "finished":
            stamped_watch.append(match.model_copy(update={"status": "finished"}))
            finished_stamped += 1
        else:
            stamped_watch.append(match)
    if finished_stamped:
        watch = save_flashscore_watch(
            db,
            day=watch.day,
            captured_at=watch.captured_at,
            matches=stamped_watch,
            last_live_poll_at=watch.last_live_poll_at,
        )

    live_candidates = [match for match in watch.matches if needs_live_poll(match, now)]
    if not live_candidates:
        finished = sum(1 for match in watch.matches if is_match_finished(match, now))
        return FlashscoreTickResult(
            status="idle",
            checked=len(watch.matches),
            eligible=0,
            emails_sent=0,
            message=(
                f"{len(watch.matches)} vigilados ≤ {LIST_ODDS_THRESHOLD:.2f}, "
                f"{finished} acabados, ninguno activo. Sin consulta Flashscore."
            ),
        )

    fast = [match for match in live_candidates if needs_fast_live_poll(match, now)]
    if not fast:
        last = watch.last_live_poll_at
        if last is not None:
            if last.tzinfo is None:
                last = last.replace(tzinfo=UTC)
            if now - last < SLOW_LIVE_POLL:
                return FlashscoreTickResult(
                    status="idle",
                    checked=len(watch.matches),
                    eligible=0,
                    emails_sent=0,
                    message=(
                        f"{len(live_candidates)} tras el 30' en modo lento (cada 5 min). "
                        "Tick omitido para ahorrar cuota Ultra."
                    ),
                )

    try:
        board = fetch_flashscore_live_board(watch.day, settings, bypass_cache=True)
    except Exception as exc:  # noqa: BLE001 - surface provider failures to the tick caller
        return FlashscoreTickResult(
            status="request_failed",
            checked=len(watch.matches),
            eligible=0,
            emails_sent=0,
            message=f"No se pudo consultar Flashscore live: {exc}",
        )

    merged = merge_flashscore_live_board(watch.matches, board)
    merged = enrich_matches_with_details(merged, settings)
    merged = [
        with_early_goal_flags(match)
        for match in enrich_matches_with_goal_minutes(merged, settings)
    ]
    save_flashscore_watch(
        db,
        day=watch.day,
        captured_at=watch.captured_at,
        matches=merged,
        last_live_poll_at=now,
    )

    eligible = [match for match in merged if is_alert_eligible(match)]
    emails_sent = 0
    for match in eligible:
        goal_minute = match.early_goal_minute if match.early_goal_minute is not None else match.minute
        if (
            not match.favorite_team
            or match.favorite_odds is None
            or goal_minute is None
            or match.home_score is None
            or match.away_score is None
        ):
            continue
        result = send_flashscore_goal_email(
            FlashscoreGoalEmailRequest(
                event_id=match.event_id,
                competition=match.competition,
                home_team=match.home_team,
                away_team=match.away_team,
                favorite_team=match.favorite_team,
                favorite_odds=match.favorite_odds,
                minute=goal_minute,
                home_score=match.home_score,
                away_score=match.away_score,
            ),
            settings,
        )
        if result.status in {"sent", "deduplicated"} and result.sent:
            if result.status == "sent":
                emails_sent += 1

    cadence = "1 min" if fast else "5 min"
    return FlashscoreTickResult(
        status="ok",
        checked=len(merged),
        eligible=len(eligible),
        emails_sent=emails_sent,
        message=(
            f"Flashscore Ultra tick ({cadence}) · {len(merged)} vigilados ≤ {LIST_ODDS_THRESHOLD:.2f} · "
            f"{len(live_candidates)} activos · {len(eligible)} señales · {emails_sent} emails nuevos."
        ),
    )


def _is_watchable(match: FlashscoreMatchRead) -> bool:
    return (
        match.favorite_odds is not None
        and match.favorite_odds <= LIST_ODDS_THRESHOLD
        and is_watchable_competition(match)
    )


def _watch_from_payload(payload: dict[str, Any]) -> FlashscoreWatchState:
    matches_raw = payload.get("matches") or []
    matches = [
        with_early_goal_flags(FlashscoreMatchRead.model_validate(item))
        for item in matches_raw
        if isinstance(item, dict)
    ]
    matches = [match for match in matches if _is_watchable(match)]
    captured_raw = payload.get("captured_at")
    captured_at = None
    if isinstance(captured_raw, str) and captured_raw:
        captured_at = datetime.fromisoformat(captured_raw.replace("Z", "+00:00"))
    updated_raw = payload.get("updated_at")
    updated_at = None
    if isinstance(updated_raw, str) and updated_raw:
        updated_at = datetime.fromisoformat(updated_raw.replace("Z", "+00:00"))
    poll_raw = payload.get("last_live_poll_at")
    last_live_poll_at = None
    if isinstance(poll_raw, str) and poll_raw:
        last_live_poll_at = datetime.fromisoformat(poll_raw.replace("Z", "+00:00"))
    return FlashscoreWatchState(
        day=int(payload.get("day") or 0),
        captured_at=captured_at,
        updated_at=updated_at,
        last_live_poll_at=last_live_poll_at,
        matches=matches,
    )
