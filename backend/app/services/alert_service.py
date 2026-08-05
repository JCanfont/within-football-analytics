from datetime import UTC, datetime

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models import Alert, Match, Player, PlayerMatchStats, Team, TeamGoalTiming
from app.services.analytics_queries import build_match_analytics, latest_forebet_prediction
from app.services.config_service import get_statistical_config


def generate_match_alerts(db: Session, match_id: int) -> list[Alert]:
    match = db.get(Match, match_id)
    if not match:
        return []

    settings = get_statistical_config(db).value
    generated: list[Alert] = []
    generated.extend(_closed_midtable_alert(db, match, settings.alert_threshold))
    generated.extend(_forebet_over_under_alerts(db, match))
    generated.extend(_late_conceding_alerts(db, match, settings.minimum_sample_size))
    generated.extend(_stadium_player_alerts(db, match, settings.minimum_sample_size))
    db.commit()
    return generated


def _closed_midtable_alert(db: Session, match: Match, threshold: float) -> list[Alert]:
    analytics = build_match_analytics(db, match.id)
    if not analytics or analytics.closed_midtable_index is None:
        return []
    if analytics.closed_midtable_index < threshold:
        return []
    return [
        _upsert_alert(
            db,
            match.id,
            "muestra_historica_solida",
            (
                f"Indice de equilibrio del partido alto: {analytics.closed_midtable_index:.2f}/100. "
                "El partido encaja con el perfil inicial de equipos centrados y equilibrados."
            ),
            {
                "closed_midtable_index": analytics.closed_midtable_index,
                "threshold": threshold,
                "inputs": analytics.inputs,
            },
            sample_size=int(analytics.inputs.get("teams_in_table", 0)),
            reliability=analytics.reliability,
        )
    ]


def _forebet_over_under_alerts(db: Session, match: Match) -> list[Alert]:
    prediction = latest_forebet_prediction(db, match.id)
    if not prediction:
        return []
    signal = _resolve_over_under_signal(prediction)
    if not signal:
        return []
    alert_type = "forebet_under_signal" if signal.startswith("under") else "forebet_over_signal"
    predicted_score = None
    if prediction.predicted_home_score is not None and prediction.predicted_away_score is not None:
        predicted_score = f"{prediction.predicted_home_score}-{prediction.predicted_away_score}"
    return [
        _upsert_alert(
            db,
            match.id,
            alert_type,
            f"Forebet marca una senal {signal} en la captura mas reciente.",
            {
                "captured_at": prediction.captured_at.isoformat(),
                "prediction": prediction.prediction,
                "predicted_score": predicted_score,
                "over_under_prediction": signal,
                "expected_goals": float(prediction.expected_goals) if prediction.expected_goals is not None else None,
            },
            sample_size=None,
            reliability="provisional",
        )
    ]


def _resolve_over_under_signal(prediction) -> str | None:
    if prediction.over_under_prediction:
        normalized = prediction.over_under_prediction.lower()
        if "under" in normalized:
            return prediction.over_under_prediction
        if "over" in normalized:
            return prediction.over_under_prediction
    if prediction.predicted_home_score is not None and prediction.predicted_away_score is not None:
        total = prediction.predicted_home_score + prediction.predicted_away_score
        return "over_2_5" if total > 2.5 else "under_2_5"
    if prediction.expected_goals is not None:
        return "over_2_5" if float(prediction.expected_goals) > 2.5 else "under_2_5"
    return None


def _late_conceding_alerts(db: Session, match: Match, minimum_sample_size: int) -> list[Alert]:
    alerts = []
    teams = [match.home_team_id, match.away_team_id]
    for team_id in teams:
        timing = db.scalar(
            select(TeamGoalTiming)
            .where(
                TeamGoalTiming.team_id == team_id,
                TeamGoalTiming.interval_start == 75,
                TeamGoalTiming.interval_end == 90,
            )
            .order_by(desc(TeamGoalTiming.calculated_at))
            .limit(1)
        )
        if not timing or timing.matches_played < minimum_sample_size:
            continue
        conceded = float(timing.percentage_conceded or 0)
        if conceded < 30:
            continue
        team = db.get(Team, team_id)
        alerts.append(
            _upsert_alert(
                db,
                match.id,
                "equipo_encaja_especialmente_al_final",
                f"{team.name if team else 'El equipo'} encaja el {conceded:.1f}% de sus goles entre el minuto 76 y el 90.",
                {
                    "team_id": team_id,
                    "interval": "76-90",
                    "percentage_conceded": conceded,
                    "matches_played": timing.matches_played,
                },
                sample_size=timing.matches_played,
                reliability="acceptable",
            )
        )
    return alerts


def _stadium_player_alerts(db: Session, match: Match, minimum_sample_size: int) -> list[Alert]:
    if not match.stadium_id:
        return []
    rows = db.execute(
        select(PlayerMatchStats, Player)
        .join(Player, PlayerMatchStats.player_id == Player.id)
        .where(PlayerMatchStats.stadium_id == match.stadium_id)
    ).all()
    alerts = []
    for stats, player in rows:
        if stats.minutes_played < minimum_sample_size:
            continue
        contributions = stats.goals + stats.assists
        if contributions <= 0:
            continue
        per_90 = round(contributions * 90 / stats.minutes_played, 2)
        if per_90 < 0.7:
            continue
        alerts.append(
            _upsert_alert(
                db,
                match.id,
                "jugador_con_buen_historial_en_el_estadio",
                (
                    f"{player.full_name} registra {per_90:.2f} participaciones de gol por 90 "
                    "en este estadio. Es una asociacion historica, no causalidad."
                ),
                {
                    "player_id": player.id,
                    "stadium_id": match.stadium_id,
                    "minutes": stats.minutes_played,
                    "goals": stats.goals,
                    "assists": stats.assists,
                    "goal_participations_per_90": per_90,
                },
                sample_size=stats.minutes_played,
                reliability="weak" if stats.minutes_played < 450 else "acceptable",
            )
        )
    return alerts


def _upsert_alert(
    db: Session,
    match_id: int,
    alert_type: str,
    reason: str,
    supporting_data: dict,
    sample_size: int | None,
    reliability: str,
) -> Alert:
    now = datetime.now(UTC)
    existing = db.scalar(select(Alert).where(Alert.match_id == match_id, Alert.alert_type == alert_type).limit(1))
    if existing:
        existing.reason = reason
        existing.supporting_data = supporting_data
        existing.sample_size = sample_size
        existing.reliability = reliability
        existing.updated_at = now
        return existing
    alert = Alert(
        match_id=match_id,
        alert_type=alert_type,
        reason=reason,
        supporting_data=supporting_data,
        sample_size=sample_size,
        reliability=reliability,
        created_at=now,
        updated_at=now,
    )
    db.add(alert)
    db.flush()
    return alert
