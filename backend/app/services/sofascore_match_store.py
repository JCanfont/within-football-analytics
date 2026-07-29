from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Competition, Match, Season, Team
from app.schemas.api import SofaScoreTeamEvent
from app.utils.normalization import normalize_name


def store_sofascore_events(db: Session, events: list[SofaScoreTeamEvent]) -> dict[str, int]:
    created = 0
    updated = 0
    for event in events:
        match, was_created = _upsert_sofascore_event(db, event)
        if was_created:
            created += 1
        else:
            updated += 1
        _update_match_from_event(match, event)
    db.commit()
    return {
        "processed": len(events),
        "created": created,
        "updated": updated,
        "total_matches": db.scalar(select(func.count(Match.id))) or 0,
    }


def _upsert_sofascore_event(db: Session, event: SofaScoreTeamEvent) -> tuple[Match, bool]:
    external_id = f"event:{event.event_id}"
    existing = db.scalar(select(Match).where(Match.source == "sofascore", Match.external_id == external_id))
    if existing:
        return existing, False

    competition = _get_or_create_competition(db, event)
    season = _get_or_create_season(db, competition, event.start_time.date())
    home_team = _get_or_create_team(db, event.home_team, event.home_team_id, event.country)
    away_team = _get_or_create_team(db, event.away_team, event.away_team_id, event.country)
    match = Match(
        competition_id=competition.id,
        season_id=season.id,
        matchday=None,
        match_date=event.start_time,
        home_team_id=home_team.id,
        away_team_id=away_team.id,
        status=_match_status(event.status),
        home_score=event.home_score,
        away_score=event.away_score,
        is_friendly=False,
        source="sofascore",
        external_id=external_id,
    )
    db.add(match)
    db.flush()
    return match, True


def _update_match_from_event(match: Match, event: SofaScoreTeamEvent) -> None:
    match.match_date = event.start_time
    match.status = _match_status(event.status)
    if event.home_score is not None:
        match.home_score = event.home_score
    if event.away_score is not None:
        match.away_score = event.away_score


def _get_or_create_competition(db: Session, event: SofaScoreTeamEvent) -> Competition:
    name = event.competition.strip() or "SofaScore live"
    country = event.country.strip() if event.country else None
    external_id = normalize_name(f"{country or 'global'}:{name}")
    competition = db.scalar(select(Competition).where(Competition.source == "sofascore", Competition.external_id == external_id))
    if competition:
        return competition
    normalized = normalize_name(name)
    competition = db.scalar(select(Competition).where(Competition.normalized_name == normalized, Competition.country == country))
    if competition:
        return competition
    competition = Competition(
        name=name,
        normalized_name=normalized,
        country=country,
        competition_type="league",
        source="sofascore",
        external_id=external_id,
    )
    db.add(competition)
    db.flush()
    return competition


def _get_or_create_season(db: Session, competition: Competition, match_date: date) -> Season:
    start_year = match_date.year if match_date.month >= 7 else match_date.year - 1
    name = f"{start_year}/{start_year + 1}"
    season = db.scalar(select(Season).where(Season.competition_id == competition.id, Season.name == name))
    if season:
        return season
    season = Season(
        competition_id=competition.id,
        name=name,
        start_date=date(start_year, 7, 1),
        end_date=date(start_year + 1, 6, 30),
        is_current=True,
    )
    db.add(season)
    db.flush()
    return season


def _get_or_create_team(db: Session, name: str, sofascore_id: int | None, country: str | None) -> Team:
    clean_name = name.strip()
    if sofascore_id:
        team = db.scalar(select(Team).where(Team.external_id == f"sofascore:{sofascore_id}"))
        if team:
            return team
    normalized = normalize_name(clean_name)
    team = db.scalar(select(Team).where(Team.normalized_name == normalized))
    if team:
        return team
    team = Team(
        name=clean_name,
        normalized_name=normalized,
        country=country,
        external_id=f"sofascore:{sofascore_id}" if sofascore_id else f"sofascore:{normalized}",
    )
    db.add(team)
    db.flush()
    return team


def _match_status(status: str) -> str:
    normalized = status.lower().strip()
    if normalized in {"inprogress", "live"}:
        return "live"
    if normalized in {"finished", "ended", "afterextra"}:
        return "finished"
    if normalized in {"postponed", "canceled", "cancelled"}:
        return normalized
    if normalized == "halftime":
        return "live"
    return "scheduled"
