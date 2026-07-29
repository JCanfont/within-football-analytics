from __future__ import annotations

from datetime import UTC, datetime, time
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.orm import Session, aliased

from app.models import Match, Team
from app.schemas.api import SofaScoreTeamEvent
from app.utils.normalization import normalize_name

LIVE_EVENT_STATUSES = {"inprogress", "halftime", "live"}


def live_only(events: list[SofaScoreTeamEvent]) -> list[SofaScoreTeamEvent]:
    return [event for event in events if event.status.lower() in LIVE_EVENT_STATUSES]


def mark_forebet_interest_matches(db: Session, events: list[SofaScoreTeamEvent]) -> list[SofaScoreTeamEvent]:
    return [_mark_event_if_interesting(db, event) for event in events]


def _mark_event_if_interesting(db: Session, event: SofaScoreTeamEvent) -> SofaScoreTeamEvent:
    match = _best_forebet_match_for_event(db, event)
    if not match:
        return event
    return event.model_copy(
        update={
            "is_interest": True,
            "interest_label": "PARTIDO DE INTERES",
            "interest_match_id": match.id,
        }
    )


def _best_forebet_match_for_event(db: Session, event: SofaScoreTeamEvent) -> Match | None:
    home = aliased(Team)
    away = aliased(Team)
    event_date = event.start_time.astimezone(UTC).date() if event.start_time.tzinfo else event.start_time.date()
    start = datetime.combine(event_date, time.min, tzinfo=UTC)
    end = datetime.combine(event_date, time.max, tzinfo=UTC)
    rows = db.execute(
        select(Match, home.name, away.name)
        .join(home, Match.home_team_id == home.id)
        .join(away, Match.away_team_id == away.id)
        .where(Match.source == "forebet", Match.match_date >= start, Match.match_date <= end)
    ).all()
    best_match = None
    best_score = 0.0
    for match, home_name, away_name in rows:
        same_order = (_similarity(event.home_team, home_name) + _similarity(event.away_team, away_name)) / 2
        reversed_order = (_similarity(event.home_team, away_name) + _similarity(event.away_team, home_name)) / 2
        score = max(same_order, reversed_order)
        if score > best_score:
            best_score = score
            best_match = match
    return best_match if best_score >= 0.78 else None


def _similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, normalize_name(left), normalize_name(right)).ratio()
