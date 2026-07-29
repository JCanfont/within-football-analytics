from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Competition, GoalMoment, Match, Team
from app.schemas.api import (
    GoalTimingSeriesRow,
    LiveCompetitionGoalComparison,
    LiveTeamGoalComparison,
    SofaScoreEventComparison,
    SofaScoreTeamEvent,
)


def build_sofascore_event_comparison(db: Session, event: SofaScoreTeamEvent) -> SofaScoreEventComparison:
    match = db.scalar(select(Match).where(Match.source == "sofascore", Match.external_id == f"event:{event.event_id}"))
    if not match:
        return SofaScoreEventComparison(
            provider="sofascore-crawlora",
            event_id=event.event_id,
            event=event,
            message="El partido todavia no esta guardado en la base; carga o guarda directos primero.",
        )

    home_team = db.get(Team, match.home_team_id)
    away_team = db.get(Team, match.away_team_id)
    competition = db.get(Competition, match.competition_id)
    return SofaScoreEventComparison(
        provider="sofascore-crawlora",
        event_id=event.event_id,
        match_id=match.id,
        event=event,
        home=_team_comparison(db, match, match.home_team_id, home_team.name if home_team else event.home_team),
        away=_team_comparison(db, match, match.away_team_id, away_team.name if away_team else event.away_team),
        competition=_competition_comparison(db, match, competition.name if competition else event.competition),
        message="Comparativa live calculada con partidos guardados en la base.",
    )


def _finished_match_filter(match: Match):
    return (
        Match.id != match.id,
        Match.status == "finished",
        Match.home_score.is_not(None),
        Match.away_score.is_not(None),
    )


def _team_comparison(db: Session, match: Match, team_id: int, team_name: str) -> LiveTeamGoalComparison:
    rows = db.scalars(
        select(Match)
        .where(
            *_finished_match_filter(match),
            or_(Match.home_team_id == team_id, Match.away_team_id == team_id),
        )
        .order_by(Match.match_date.desc())
        .limit(60)
    ).all()
    goals_for = 0
    goals_against = 0
    for row in rows:
        if row.home_team_id == team_id:
            goals_for += int(row.home_score or 0)
            goals_against += int(row.away_score or 0)
        else:
            goals_for += int(row.away_score or 0)
            goals_against += int(row.home_score or 0)
    matches = len(rows)
    return LiveTeamGoalComparison(
        team_id=team_id,
        team=team_name,
        matches=matches,
        goals_for=goals_for,
        goals_against=goals_against,
        goals_for_average=round(goals_for / matches, 2) if matches else 0.0,
        goals_against_average=round(goals_against / matches, 2) if matches else 0.0,
        interval_rows=_goal_interval_rows(db, match, team_id, team_name),
    )


def _competition_comparison(db: Session, match: Match, competition_name: str) -> LiveCompetitionGoalComparison:
    rows = db.execute(
        select(func.count(Match.id), func.coalesce(func.sum(Match.home_score + Match.away_score), 0))
        .where(
            *_finished_match_filter(match),
            Match.competition_id == match.competition_id,
        )
    ).one()
    matches = int(rows[0] or 0)
    total_goals = int(rows[1] or 0)
    return LiveCompetitionGoalComparison(
        competition_id=match.competition_id,
        competition=competition_name,
        matches=matches,
        total_goals=total_goals,
        goals_per_match=round(total_goals / matches, 2) if matches else 0.0,
    )


def _goal_interval_rows(db: Session, match: Match, team_id: int, team_name: str) -> list[GoalTimingSeriesRow]:
    rows = db.execute(
        select(GoalMoment.interval_start, GoalMoment.interval_end, func.count(GoalMoment.id))
        .join(Match, GoalMoment.match_id == Match.id)
        .where(
            *_finished_match_filter(match),
            Match.competition_id == match.competition_id,
            GoalMoment.scoring_team_id == team_id,
        )
        .group_by(GoalMoment.interval_start, GoalMoment.interval_end)
        .order_by(GoalMoment.interval_start)
    ).all()
    return [
        GoalTimingSeriesRow(
            team_id=team_id,
            team=team_name,
            interval_start=int(interval_start),
            interval_end=int(interval_end),
            goals_scored=int(goals),
            matches_played=0,
        )
        for interval_start, interval_end, goals in rows
    ]
