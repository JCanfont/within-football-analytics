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
    SofaScoreGoalIncident,
    SofaScoreTeamEvent,
)
from app.services.email_alerts import send_flashscore_goal_email
from app.services.sofascore_crawlora_provider import fetch_event_incidents, fetch_live_events
from app.utils.team_match import same_team


FLASHSCORE_WATCH_KEY = "flashscore_watch"
ALERT_ODDS_THRESHOLD = 1.5
EARLY_GOAL_MINUTE = 30


def save_flashscore_watch(
    db: Session,
    *,
    day: int,
    captured_at: datetime | None,
    matches: list[FlashscoreMatchRead],
) -> FlashscoreWatchState:
    stamp = captured_at or datetime.now(UTC)
    payload = {
        "day": day,
        "captured_at": stamp.isoformat(),
        "matches": [match.model_dump(mode="json") for match in matches],
        "updated_at": datetime.now(UTC).isoformat(),
    }
    config = db.scalar(select(StatisticalConfig).where(StatisticalConfig.key == FLASHSCORE_WATCH_KEY))
    if not config:
        config = StatisticalConfig(
            key=FLASHSCORE_WATCH_KEY,
            description="Flashscore low-odds watchlist for SofaScore signal ticks.",
            value=payload,
        )
        db.add(config)
    else:
        config.value = payload
        config.description = "Flashscore low-odds watchlist for SofaScore signal ticks."
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
    }
    db.commit()


def merge_flashscore_with_sofascore(
    matches: list[FlashscoreMatchRead],
    events: list[SofaScoreTeamEvent],
) -> list[FlashscoreMatchRead]:
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
            # Always take the freshly computed live minute; never keep a stale captured value
            # when the provider has live timing for the event.
            if event.minute is not None:
                data["minute"] = event.minute
                data["minute_extra"] = event.minute_extra
            data["home_score"] = event.home_score if event.home_score is not None else match.home_score
            data["away_score"] = event.away_score if event.away_score is not None else match.away_score
            data["sofascore_event_id"] = event.event_id
        merged.append(with_early_goal_flags(FlashscoreMatchRead.model_validate(data)))
    return merged


def apply_goal_incidents(
    match: FlashscoreMatchRead,
    goals: list[SofaScoreGoalIncident],
) -> FlashscoreMatchRead:
    """Attach the real goal minutes from the SofaScore timeline and re-evaluate flags.

    An empty timeline (e.g. a transient provider glitch) never wipes a minute already
    detected — the previously stored minutes are kept.
    """
    if not goals:
        return with_early_goal_flags(match)
    home_minutes = sorted({goal.minute for goal in goals if goal.is_home})
    away_minutes = sorted({goal.minute for goal in goals if not goal.is_home})
    data = match.model_dump()
    data["home_goal_minutes"] = home_minutes
    data["away_goal_minutes"] = away_minutes
    return with_early_goal_flags(FlashscoreMatchRead.model_validate(data))


def favorite_early_goal_minute(match: FlashscoreMatchRead) -> int | None:
    """First real minute (≤30) the favorite scored, when the timeline is known."""
    if match.favorite_side not in {"home", "away"}:
        return None
    minutes = match.away_goal_minutes if match.favorite_side == "away" else match.home_goal_minutes
    early = [minute for minute in minutes if minute <= EARLY_GOAL_MINUTE]
    return min(early) if early else None


def with_early_goal_flags(match: FlashscoreMatchRead) -> FlashscoreMatchRead:
    minute = match.minute
    home_score = match.home_score or 0
    away_score = match.away_score or 0
    total_goals = home_score + away_score
    favorite_score = away_score if match.favorite_side == "away" else home_score
    in_early_window = minute is not None and minute <= EARLY_GOAL_MINUTE

    # Real goal minutes from the SofaScore timeline take priority over the poll-minute guess.
    home_minutes = sorted(match.home_goal_minutes or [])
    away_minutes = sorted(match.away_goal_minutes or [])
    favorite_minutes = away_minutes if match.favorite_side == "away" else home_minutes
    early_incident_minutes = [value for value in home_minutes + away_minutes if value <= EARLY_GOAL_MINUTE]
    favorite_early_incident = [value for value in favorite_minutes if value <= EARLY_GOAL_MINUTE]
    has_incidents = bool(home_minutes or away_minutes)

    favorite_watched = (
        match.favorite_team is not None
        and match.favorite_odds is not None
        and match.favorite_odds <= ALERT_ODDS_THRESHOLD
    )

    if has_incidents:
        saw_early_goal = bool(match.early_goal) or bool(early_incident_minutes)
        saw_early_favorite_goal = bool(match.early_favorite_goal) or (
            favorite_watched and bool(favorite_early_incident)
        )
    else:
        saw_early_goal = bool(match.early_goal) or (in_early_window and total_goals > 0)
        saw_early_favorite_goal = bool(match.early_favorite_goal) or (
            in_early_window and favorite_watched and favorite_score > 0
        )

    # Prefer the true incident minute; fall back to the previously stored or current poll minute.
    if early_incident_minutes:
        early_goal_minute = min(early_incident_minutes)
    elif match.early_goal_minute is not None:
        early_goal_minute = match.early_goal_minute
    elif saw_early_goal and in_early_window:
        early_goal_minute = minute
    else:
        early_goal_minute = None

    # First goal of the match (any team), taken only from the timeline and kept sticky
    # once detected. Never inferred from the current scoreline.
    all_incident_minutes = sorted(home_minutes + away_minutes)
    first_goal_minute = all_incident_minutes[0] if all_incident_minutes else match.first_goal_minute
    goal_under_30 = first_goal_minute is not None and first_goal_minute <= EARLY_GOAL_MINUTE

    return match.model_copy(
        update={
            "home_goal_minutes": home_minutes,
            "away_goal_minutes": away_minutes,
            "early_goal": saw_early_goal,
            "early_favorite_goal": saw_early_favorite_goal,
            "early_goal_minute": early_goal_minute,
            "first_goal_minute": first_goal_minute,
            "goal_under_30": goal_under_30,
            "alert_eligible": saw_early_favorite_goal or is_alert_eligible(match),
        }
    )


def is_alert_eligible(match: FlashscoreMatchRead) -> bool:
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


def needs_live_poll(match: FlashscoreMatchRead, now: datetime | None = None) -> bool:
    """True when a ≤1.50 favorite can still produce a timely early-goal signal."""
    if match.favorite_odds is None or match.favorite_odds > ALERT_ODDS_THRESHOLD:
        return False
    if match.early_favorite_goal or match.alert_eligible:
        return False
    status = (match.status or "").lower()
    if "finish" in status or "ended" in status or "afterpen" in status:
        return False
    if match.minute is not None:
        return match.minute <= EARLY_GOAL_MINUTE + 10
    if match.start_time is None:
        return True
    current = now or datetime.now(UTC)
    start = match.start_time
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    return start - timedelta(minutes=20) <= current <= start + timedelta(minutes=50)


def _enrich_eligible_with_incidents(match: FlashscoreMatchRead) -> FlashscoreMatchRead:
    """Fetch the SofaScore goal timeline for an alert-eligible match, if not already known.

    Bounded to alert-eligible matches to keep Crawlora credit usage proportional to signals.
    """
    if not is_alert_eligible(match) or match.sofascore_event_id is None:
        return match
    if match.home_goal_minutes or match.away_goal_minutes:
        return match
    try:
        incidents = fetch_event_incidents(match.sofascore_event_id)
    except Exception:  # noqa: BLE001 - never break the tick on a timeline fetch
        return match
    return apply_goal_incidents(match, incidents.goals)


def run_flashscore_signal_tick(db: Session, settings: Settings | None = None) -> FlashscoreTickResult:
    settings = settings or get_settings()
    watch = load_flashscore_watch(db)
    if watch is None or not watch.matches:
        return FlashscoreTickResult(
            status="no_watch",
            checked=0,
            eligible=0,
            emails_sent=0,
            message="No hay lista vigilada. Captura cuotas ≤ 1,60 en la web para activar señales en segundo plano.",
        )

    if not settings.crawlora_api_key:
        return FlashscoreTickResult(
            status="provider_not_configured",
            checked=len(watch.matches),
            eligible=0,
            emails_sent=0,
            message="Falta CRAWLORA_API_KEY para revisar goles con SofaScore.",
        )

    critical = [match for match in watch.matches if needs_live_poll(match)]
    if not critical:
        return FlashscoreTickResult(
            status="idle",
            checked=len(watch.matches),
            eligible=0,
            emails_sent=0,
            message=(
                f"{len(watch.matches)} vigilados, ninguno en ventana critica. "
                "Sin consulta SofaScore (ahorra creditos Crawlora)."
            ),
        )

    try:
        live = fetch_live_events("football")
    except Exception as exc:  # noqa: BLE001 - surface provider failures to the tick caller
        return FlashscoreTickResult(
            status="request_failed",
            checked=len(watch.matches),
            eligible=0,
            emails_sent=0,
            message=f"No se pudo consultar SofaScore live: {exc}",
        )

    merged = merge_flashscore_with_sofascore(watch.matches, live.events)
    # Enrich alert-eligible matches with the real goal timeline so the email reports the true minute.
    merged = [_enrich_eligible_with_incidents(match) for match in merged]
    save_flashscore_watch(
        db,
        day=watch.day,
        captured_at=watch.captured_at,
        matches=merged,
    )

    eligible = [match for match in merged if is_alert_eligible(match)]
    emails_sent = 0
    for match in eligible:
        if (
            not match.favorite_team
            or match.favorite_odds is None
            or match.minute is None
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
                minute=favorite_early_goal_minute(match) or match.minute,
                home_score=match.home_score,
                away_score=match.away_score,
            ),
            settings,
        )
        if result.status in {"sent", "deduplicated"} and result.sent:
            if result.status == "sent":
                emails_sent += 1

    return FlashscoreTickResult(
        status="ok",
        checked=len(merged),
        eligible=len(eligible),
        emails_sent=emails_sent,
        message=(
            f"SofaScore tick · {len(merged)} vigilados · {len(live.events)} live · "
            f"{len(eligible)} señales · {emails_sent} emails nuevos."
        ),
    )


def _watch_from_payload(payload: dict[str, Any]) -> FlashscoreWatchState:
    matches_raw = payload.get("matches") or []
    matches = [FlashscoreMatchRead.model_validate(item) for item in matches_raw]
    captured_raw = payload.get("captured_at")
    captured_at = None
    if isinstance(captured_raw, str) and captured_raw:
        captured_at = datetime.fromisoformat(captured_raw.replace("Z", "+00:00"))
    updated_raw = payload.get("updated_at")
    updated_at = None
    if isinstance(updated_raw, str) and updated_raw:
        updated_at = datetime.fromisoformat(updated_raw.replace("Z", "+00:00"))
    return FlashscoreWatchState(
        day=int(payload.get("day") or 0),
        captured_at=captured_at,
        updated_at=updated_at,
        matches=[with_early_goal_flags(match) for match in matches],
    )
