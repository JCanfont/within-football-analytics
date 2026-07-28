from datetime import UTC, date, datetime, time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, aliased, selectinload

from app.database import get_db
from app.models import Competition, ForebetPrediction, Match, Season, Stadium, StandingsSnapshot, Team
from app.schemas.api import (
    CompetitionRead,
    ForebetPredictionRead,
    MatchDetail,
    MatchListItem,
    StadiumRead,
    StandingRead,
    TeamRead,
)
from app.services.analytics_queries import build_match_analytics


router = APIRouter(prefix="/api/matches", tags=["matches"])


@router.get("", response_model=list[MatchListItem])
def list_matches(db: Session = Depends(get_db), limit: int = 100, include_analytics: bool = False) -> list[MatchListItem]:
    return _match_list(db, select(Match).order_by(Match.match_date.desc()).limit(limit), include_analytics=include_analytics)


@router.get("/today", response_model=list[MatchListItem])
def list_today_matches(db: Session = Depends(get_db)) -> list[MatchListItem]:
    today = date.today()
    start = datetime.combine(today, time.min, tzinfo=UTC)
    end = datetime.combine(today, time.max, tzinfo=UTC)
    return _match_list(
        db,
        select(Match).where(Match.match_date >= start, Match.match_date <= end).order_by(Match.match_date),
        include_analytics=False,
    )


@router.get("/{match_id}", response_model=MatchDetail)
def get_match(match_id: int, db: Session = Depends(get_db)) -> MatchDetail:
    match = db.scalar(
        select(Match)
        .where(Match.id == match_id)
        .options(selectinload(Match.forebet_predictions), selectinload(Match.stadium))
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    competition = db.get(Competition, match.competition_id)
    season = db.get(Season, match.season_id)
    home_team = db.get(Team, match.home_team_id)
    away_team = db.get(Team, match.away_team_id)
    standings = _standings_for_match(db, match)
    return MatchDetail(
        id=match.id,
        match_date=match.match_date,
        competition=CompetitionRead.model_validate(competition),
        season=season.name,
        home_team=TeamRead.model_validate(home_team),
        away_team=TeamRead.model_validate(away_team),
        stadium=StadiumRead.model_validate(match.stadium) if match.stadium else None,
        matchday=match.matchday,
        status=match.status,
        is_friendly=match.is_friendly,
        home_score=match.home_score,
        away_score=match.away_score,
        forebet_predictions=[
            ForebetPredictionRead.model_validate(prediction)
            for prediction in sorted(match.forebet_predictions, key=lambda item: item.captured_at, reverse=True)
        ],
        standings=standings,
    )


def _match_list(db: Session, stmt, include_analytics: bool) -> list[MatchListItem]:
    home = aliased(Team)
    away = aliased(Team)
    rows = db.execute(
        stmt.join(Competition, Match.competition_id == Competition.id)
        .join(Season, Match.season_id == Season.id)
        .join(home, Match.home_team_id == home.id)
        .join(away, Match.away_team_id == away.id)
        .with_only_columns(Match, Competition.name, Competition.competition_type, Season.name, home.name, away.name)
    ).all()
    items = []
    match_ids = [row[0].id for row in rows]
    latest_by_match = _latest_forebet_predictions(db, match_ids)
    for match, competition_name, competition_type, season_name, home_name, away_name in rows:
        latest = latest_by_match.get(match.id)
        analytics = build_match_analytics(db, match.id) if include_analytics else None
        items.append(
            MatchListItem(
                id=match.id,
                match_date=match.match_date,
                competition=competition_name,
                competition_type=competition_type,
                season=season_name,
                home_team=home_name,
                away_team=away_name,
                status=match.status,
                home_score=match.home_score,
                away_score=match.away_score,
                is_friendly=match.is_friendly,
                latest_forebet_prediction=latest.prediction if latest else None,
                closed_midtable_index=analytics.closed_midtable_index if analytics else None,
            )
        )
    return items


def _latest_forebet_predictions(db: Session, match_ids: list[int]) -> dict[int, ForebetPrediction]:
    if not match_ids:
        return {}
    latest_by_match: dict[int, ForebetPrediction] = {}
    for index in range(0, len(match_ids), 900):
        chunk = match_ids[index : index + 900]
        predictions = db.scalars(
            select(ForebetPrediction)
            .where(ForebetPrediction.match_id.in_(chunk))
            .order_by(ForebetPrediction.match_id, desc(ForebetPrediction.captured_at))
        ).all()
        for prediction in predictions:
            latest_by_match.setdefault(prediction.match_id, prediction)
    return latest_by_match


def _standings_for_match(db: Session, match: Match) -> list[StandingRead]:
    rows = db.execute(
        select(StandingsSnapshot, Team.name)
        .join(Team, StandingsSnapshot.team_id == Team.id)
        .where(
            StandingsSnapshot.competition_id == match.competition_id,
            StandingsSnapshot.season_id == match.season_id,
            StandingsSnapshot.team_id.in_([match.home_team_id, match.away_team_id]),
            StandingsSnapshot.snapshot_date <= match.match_date,
        )
        .order_by(StandingsSnapshot.snapshot_date.desc())
    ).all()
    latest_by_team: dict[int, StandingRead] = {}
    for standing, team_name in rows:
        if standing.team_id in latest_by_team:
            continue
        latest_by_team[standing.team_id] = StandingRead(
            team_id=standing.team_id,
            team=team_name,
            matchday=standing.matchday,
            snapshot_date=standing.snapshot_date,
            position=standing.position,
            played=standing.played,
            goals_for=standing.goals_for,
            goals_against=standing.goals_against,
            goal_difference=standing.goal_difference,
            points=standing.points,
        )
    return list(latest_by_team.values())
