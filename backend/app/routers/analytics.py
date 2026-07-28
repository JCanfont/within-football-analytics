from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Competition, GoalMoment, Match, Season, Team, TeamGoalTiming
from app.schemas.api import ForebetDateLoadResult, ForebetRangeItem, GoalMomentRead, GoalTimingContext, GoalTimingRead, GoalTimingSeriesRow, MatchAnalytics, PlayerStadiumAnalytics, StadiumPlayerAnalytics
from app.services.analytics_queries import build_match_analytics, player_stadium_analytics, stadium_players_analytics
from app.services.forebet_importer import ForebetSourcePrediction, import_forebet_jornada


router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/matches/{match_id}", response_model=MatchAnalytics)
def get_match_analytics(match_id: int, db: Session = Depends(get_db)) -> MatchAnalytics:
    analytics = build_match_analytics(db, match_id)
    if not analytics:
        raise HTTPException(status_code=404, detail="Match not found")
    return analytics


@router.get("/team/{team_id}/goal-timing", response_model=list[GoalTimingRead])
def get_team_goal_timing(team_id: int, db: Session = Depends(get_db)) -> list[TeamGoalTiming]:
    rows = list(
        db.scalars(
            select(TeamGoalTiming)
            .where(TeamGoalTiming.team_id == team_id)
            .order_by(desc(TeamGoalTiming.calculated_at), TeamGoalTiming.interval_start)
        ).all()
    )
    latest_at = rows[0].calculated_at if rows else None
    return [row for row in rows if row.calculated_at == latest_at]


@router.get("/matches/{match_id}/goal-timing-context", response_model=GoalTimingContext)
def get_match_goal_timing_context(match_id: int, db: Session = Depends(get_db)) -> GoalTimingContext:
    match = db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    current_season = db.get(Season, match.season_id)
    previous_season = _previous_season(db, match)
    use_current = (match.matchday or 0) >= 5
    season_for_chart = current_season if use_current and current_season else previous_season or current_season
    archived_season = previous_season if use_current else None
    season_ids = _latest_three_season_ids(db, match)

    home_team = db.get(Team, match.home_team_id)
    away_team = db.get(Team, match.away_team_id)
    home_name = home_team.name if home_team else str(match.home_team_id)
    away_name = away_team.name if away_team else str(match.away_team_id)

    home_season_match_ids = _season_match_ids(db, match, season_for_chart.id if season_for_chart else None, match.home_team_id)
    away_season_match_ids = _season_match_ids(db, match, season_for_chart.id if season_for_chart else None, match.away_team_id)
    home_archived_match_ids = _season_match_ids(db, match, archived_season.id if archived_season else None, match.home_team_id)
    away_archived_match_ids = _season_match_ids(db, match, archived_season.id if archived_season else None, match.away_team_id)
    direct_match_ids = _direct_match_ids(db, match, season_ids)

    return GoalTimingContext(
        mode="current_season" if use_current else "previous_season_fixed",
        season_label=season_for_chart.name if season_for_chart else "Sin temporada",
        season_reason=(
            "Temporada en curso: se han alcanzado al menos cinco jornadas."
            if use_current
            else "Temporada anterior fija: la temporada en curso aun no llega a cinco jornadas."
        ),
        direct_label="Enfrentamientos directos ultimas temporadas",
        archived_label=archived_season.name if archived_season else None,
        home_season_rows=_goal_rows(db, home_season_match_ids, match.home_team_id, home_name),
        away_season_rows=_goal_rows(db, away_season_match_ids, match.away_team_id, away_name),
        home_direct_rows=_goal_rows(db, direct_match_ids, match.home_team_id, home_name),
        away_direct_rows=_goal_rows(db, direct_match_ids, match.away_team_id, away_name),
        home_archived_rows=_goal_rows(db, home_archived_match_ids, match.home_team_id, home_name),
        away_archived_rows=_goal_rows(db, away_archived_match_ids, match.away_team_id, away_name),
    )


@router.get("/matches/{match_id}/goal-moments", response_model=list[GoalMomentRead])
def get_match_goal_moments(match_id: int, db: Session = Depends(get_db)) -> list[GoalMomentRead]:
    match = db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    rows = db.execute(
        select(GoalMoment, Team.name)
        .join(Team, GoalMoment.scoring_team_id == Team.id)
        .where(GoalMoment.match_id == match_id)
        .order_by(GoalMoment.minute, GoalMoment.id)
    ).all()
    return [
        GoalMomentRead(
            id=moment.id,
            match_id=moment.match_id,
            team_id=moment.scoring_team_id,
            team=team_name,
            minute=moment.minute,
            period=moment.period,
            interval_start=moment.interval_start,
            interval_end=moment.interval_end,
        )
        for moment, team_name in rows
    ]


@router.get("/forebet-ranges", response_model=list[ForebetRangeItem])
def get_forebet_ranges(db: Session = Depends(get_db), limit: int = 2000) -> list[ForebetRangeItem]:
    matches = list(db.scalars(select(Match).order_by(desc(Match.match_date)).limit(limit)).all())
    return [_forebet_range_item(db, match) for match in matches]


@router.post("/forebet/load-date", response_model=ForebetDateLoadResult)
def load_forebet_date(target_date: date, db: Session = Depends(get_db)) -> ForebetDateLoadResult:
    forebet_outcome = import_forebet_jornada(db, target_date)
    matches = list(
        db.scalars(
            select(Match)
            .where(func.date(Match.match_date) == target_date.isoformat())
            .order_by(Match.match_date, Match.id)
        ).all()
    )
    items = [_forebet_range_item(db, match) for match in matches]
    if not items and forebet_outcome.predictions:
        items = [_forebet_source_item(index, prediction) for index, prediction in enumerate(forebet_outcome.predictions, start=1)]
    if items:
        message = (
            f"Se han encontrado {len(items)} partidos para la fecha {target_date.isoformat()} "
            "y se ha calculado el rango de resultado para toda la jornada cargada. "
            f"Forebet: {forebet_outcome.message}"
        )
        status = "ok" if forebet_outcome.status in {"ok", "reader_fallback", "storage_unavailable", "blocked", "request_failed", "no_forebet_matches"} else forebet_outcome.status
    else:
        message = (
            f"No hay partidos cargados para la fecha {target_date.isoformat()}. "
            f"Forebet: {forebet_outcome.message}"
        )
        status = "no_local_matches" if forebet_outcome.status != "ok" else "no_local_match"
    return ForebetDateLoadResult(
        target_date=target_date,
        status=status,
        message=message,
        external_fetch_status=forebet_outcome.status,
        forebet_source_url=forebet_outcome.source_url,
        forebet_fetched=forebet_outcome.fetched,
        forebet_matched=forebet_outcome.matched,
        forebet_created_matches=forebet_outcome.created_matches,
        forebet_imported=forebet_outcome.imported,
        forebet_unmatched=forebet_outcome.unmatched,
        matches=items,
    )


@router.get("/player/{player_id}/stadiums", response_model=list[PlayerStadiumAnalytics])
def get_player_stadiums(player_id: int, db: Session = Depends(get_db)) -> list[PlayerStadiumAnalytics]:
    return player_stadium_analytics(db, player_id)


def _previous_season(db: Session, match: Match) -> Season | None:
    current = db.get(Season, match.season_id)
    if not current:
        return None
    return db.scalar(
        select(Season)
        .where(Season.competition_id == match.competition_id, Season.name < current.name)
        .order_by(desc(Season.name))
        .limit(1)
    )


def _latest_three_season_ids(db: Session, match: Match) -> list[int]:
    return [
        row[0]
        for row in db.execute(
            select(Season.id)
            .where(Season.competition_id == match.competition_id)
            .order_by(desc(Season.name))
            .limit(3)
        ).all()
    ]


def _season_match_ids(db: Session, match: Match, season_id: int | None, team_id: int) -> list[int]:
    if season_id is None:
        return []
    return [
        row[0]
        for row in db.execute(
            select(Match.id).where(
                Match.competition_id == match.competition_id,
                Match.season_id == season_id,
                (Match.home_team_id == team_id) | (Match.away_team_id == team_id),
            )
        ).all()
    ]


def _direct_match_ids(db: Session, match: Match, season_ids: list[int]) -> list[int]:
    if not season_ids:
        return []
    return [
        row[0]
        for row in db.execute(
            select(Match.id).where(
                Match.competition_id == match.competition_id,
                Match.season_id.in_(season_ids),
                (
                    (Match.home_team_id == match.home_team_id) & (Match.away_team_id == match.away_team_id)
                )
                | (
                    (Match.home_team_id == match.away_team_id) & (Match.away_team_id == match.home_team_id)
                ),
            )
        ).all()
    ]


def _goal_rows(db: Session, match_ids: list[int], team_id: int, team_name: str) -> list[GoalTimingSeriesRow]:
    if not match_ids:
        return []
    rows = db.execute(
        select(GoalMoment.interval_start, GoalMoment.interval_end, func.count(GoalMoment.id))
        .where(GoalMoment.match_id.in_(match_ids), GoalMoment.scoring_team_id == team_id)
        .group_by(GoalMoment.interval_start, GoalMoment.interval_end)
        .order_by(GoalMoment.interval_start)
    ).all()
    return [
        GoalTimingSeriesRow(
            team_id=team_id,
            team=team_name,
            interval_start=interval_start,
            interval_end=interval_end,
            goals_scored=int(goals),
            matches_played=len(match_ids),
        )
        for interval_start, interval_end, goals in rows
    ]


def _forebet_range_item(db: Session, match: Match) -> ForebetRangeItem:
    competition = db.get(Competition, match.competition_id)
    season = db.get(Season, match.season_id)
    home = db.get(Team, match.home_team_id)
    away = db.get(Team, match.away_team_id)
    analytics = build_match_analytics(db, match.id)
    latest = analytics.latest_forebet if analytics else None
    return ForebetRangeItem(
        match_id=match.id,
        match_date=match.match_date,
        competition=competition.name if competition else str(match.competition_id),
        season=season.name if season else str(match.season_id),
        home_team=home.name if home else str(match.home_team_id),
        away_team=away.name if away else str(match.away_team_id),
        status=match.status,
        forebet_prediction=latest.prediction if latest else None,
        expected_goals=latest.expected_goals if latest else None,
        score_range=analytics.inputs.get("score_range") if analytics else None,
        reliability=analytics.reliability if analytics else "insufficient",
    )


def _forebet_source_item(index: int, prediction: ForebetSourcePrediction) -> ForebetRangeItem:
    start_year = prediction.match_date.year if prediction.match_date.month >= 7 else prediction.match_date.year - 1
    return ForebetRangeItem(
        match_id=-index,
        match_date=prediction.match_date,
        competition="Forebet",
        season=f"{start_year}/{start_year + 1}",
        home_team=prediction.home_team,
        away_team=prediction.away_team,
        status="scheduled",
        forebet_prediction=prediction.prediction,
        expected_goals=prediction.expected_goals,
        score_range=_forebet_source_score_range(prediction),
        reliability="forebet_external",
    )


def _forebet_source_score_range(prediction: ForebetSourcePrediction) -> dict | None:
    if not prediction.predicted_score:
        return None
    return {
        "source": "forebet",
        "summary": prediction.predicted_score,
        "possible_scores": [prediction.predicted_score],
        "predicted_score": prediction.predicted_score,
        "explanation": "Resultado probable leido directamente de Forebet para la fecha solicitada.",
    }


@router.get("/stadium/{stadium_id}/players", response_model=StadiumPlayerAnalytics)
def get_stadium_players(stadium_id: int, db: Session = Depends(get_db)) -> StadiumPlayerAnalytics:
    analytics = stadium_players_analytics(db, stadium_id)
    if not analytics:
        raise HTTPException(status_code=404, detail="Stadium not found")
    return analytics
