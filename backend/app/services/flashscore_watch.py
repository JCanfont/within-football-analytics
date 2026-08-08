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
from app.services.sofascore_crawlora_provider import fetch_live_events
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
    saw_early_goal = bool(match.early_goal) or (in_early_window and total_goals > 0)
    saw_early_favorite_goal = bool(match.early_favorite_goal) or (
        in_early_window
        and match.favorite_team is not None
        and match.favorite_odds is not None
        and match.favorite_odds <= ALERT_ODDS_THRESHOLD
        and favorite_score > 0
    )
    early_goal_minute = match.early_goal_minute
    if early_goal_minute is None and saw_early_goal and in_early_window:
        early_goal_minute = minute
    return match.model_copy(
        update={
            "early_goal": saw_early_goal,
            "early_favorite_goal": saw_early_favorite_goal,
            "early_goal_minute": early_goal_minute,
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
                minute=match.minute,
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
