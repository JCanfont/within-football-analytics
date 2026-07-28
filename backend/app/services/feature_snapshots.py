from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Match, MatchFeatureSnapshot, StandingsSnapshot
from app.services.analytics_queries import build_match_analytics, latest_standing_before_match


FEATURE_SCHEMA_VERSION = "v1"


def get_or_build_match_features(db: Session, match_id: int, force: bool = False) -> MatchFeatureSnapshot | None:
    match = db.get(Match, match_id)
    if not match:
        return None

    existing = db.scalar(
        select(MatchFeatureSnapshot).where(
            MatchFeatureSnapshot.match_id == match_id,
            MatchFeatureSnapshot.schema_version == FEATURE_SCHEMA_VERSION,
        )
    )
    if existing and not force:
        return existing

    analytics = build_match_analytics(db, match.id)
    home_standing = latest_standing_before_match(db, match, match.home_team_id)
    away_standing = latest_standing_before_match(db, match, match.away_team_id)
    home_recent = analytics.inputs.get("home_recent_form", {}) if analytics else {}
    away_recent = analytics.inputs.get("away_recent_form", {}) if analytics else {}
    score_range = analytics.inputs.get("score_range") if analytics else None
    closed_midtable_index = Decimal(str(round(analytics.closed_midtable_index, 2))) if analytics and analytics.closed_midtable_index is not None else None
    total_goals = match.home_score + match.away_score if match.home_score is not None and match.away_score is not None else None
    classification_gap = _classification_gap(home_standing, away_standing)

    vector = {
        "schema": FEATURE_SCHEMA_VERSION,
        "order": [
            "competition_id",
            "season_id",
            "matchday",
            "home_team_id",
            "away_team_id",
            "home_goals",
            "away_goals",
            "total_goals",
            "home_position",
            "away_position",
            "classification_gap",
            "home_recent_points",
            "away_recent_points",
            "home_recent_goal_difference",
            "away_recent_goal_difference",
            "closed_midtable_index",
        ],
        "values": [
            match.competition_id,
            match.season_id,
            match.matchday,
            match.home_team_id,
            match.away_team_id,
            match.home_score,
            match.away_score,
            total_goals,
            home_standing.position if home_standing else None,
            away_standing.position if away_standing else None,
            classification_gap,
            int(home_recent.get("points", 0)),
            int(away_recent.get("points", 0)),
            int(home_recent.get("goal_difference", 0)),
            int(away_recent.get("goal_difference", 0)),
            float(closed_midtable_index) if closed_midtable_index is not None else None,
        ],
        "explainability": {
            "score_range_summary": score_range.get("summary") if isinstance(score_range, dict) else None,
            "analytics_reliability": analytics.reliability if analytics else "insufficient",
            "status": analytics.status if analytics else "insufficient_data",
        },
    }

    payload = {
        "tensor_key": _tensor_key(match),
        "competition_id": match.competition_id,
        "season_id": match.season_id,
        "matchday": match.matchday,
        "home_team_id": match.home_team_id,
        "away_team_id": match.away_team_id,
        "home_goals": match.home_score,
        "away_goals": match.away_score,
        "total_goals": total_goals,
        "home_position": home_standing.position if home_standing else None,
        "away_position": away_standing.position if away_standing else None,
        "classification_gap": classification_gap,
        "home_recent_points": int(home_recent.get("points", 0)),
        "away_recent_points": int(away_recent.get("points", 0)),
        "home_recent_goal_difference": int(home_recent.get("goal_difference", 0)),
        "away_recent_goal_difference": int(away_recent.get("goal_difference", 0)),
        "closed_midtable_index": closed_midtable_index,
        "score_range": score_range,
        "feature_vector": vector,
        "calculated_at": datetime.now(UTC),
    }

    if existing:
        for key, value in payload.items():
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    snapshot = MatchFeatureSnapshot(match_id=match.id, schema_version=FEATURE_SCHEMA_VERSION, **payload)
    db.add(snapshot)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return db.scalar(
            select(MatchFeatureSnapshot).where(
                MatchFeatureSnapshot.match_id == match_id,
                MatchFeatureSnapshot.schema_version == FEATURE_SCHEMA_VERSION,
            )
        )
    db.refresh(snapshot)
    return snapshot


def rebuild_match_features(db: Session, limit: int = 1000) -> list[MatchFeatureSnapshot]:
    match_ids = [
        row[0]
        for row in db.execute(
            select(Match.id)
            .where(Match.home_score.is_not(None), Match.away_score.is_not(None))
            .order_by(Match.match_date.desc(), Match.id.desc())
            .limit(limit)
        ).all()
    ]
    snapshots: list[MatchFeatureSnapshot] = []
    for match_id in match_ids:
        snapshot = get_or_build_match_features(db, match_id, force=True)
        if snapshot:
            snapshots.append(snapshot)
    return snapshots


def _classification_gap(home: StandingsSnapshot | None, away: StandingsSnapshot | None) -> int | None:
    if not home or not away:
        return None
    return abs(home.position - away.position)


def _tensor_key(match: Match) -> str:
    matchday = match.matchday if match.matchday is not None else "na"
    return f"competition:{match.competition_id}|season:{match.season_id}|round:{matchday}|home:{match.home_team_id}|away:{match.away_team_id}"
