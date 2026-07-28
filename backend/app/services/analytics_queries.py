import math

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, aliased

from app.analytics.statistics import (
    ClosedMidtableInputs,
    centrality_distance,
    classification_distance,
    closed_midtable_index,
    goal_activity,
    goal_balance,
    historical_sample_reliability,
    per_90,
    player_minutes_reliability,
    relative_position,
)
from app.models import Competition, ForebetPrediction, Match, Player, PlayerMatchStats, Season, Stadium, StandingsSnapshot, Team, TeamGoalTiming
from app.schemas.api import (
    DirectMatchResult,
    GoalParameterProfile,
    MatchAnalytics,
    PlayerStadiumAnalytics,
    StadiumPlayerAnalytics,
    TeamGoalParameter,
    TeamReferenceStanding,
    ThreeSeasonSummary,
)
from app.services.config_service import get_statistical_config


def build_match_analytics(db: Session, match_id: int) -> MatchAnalytics | None:
    match = db.get(Match, match_id)
    if not match:
        return None

    latest_forebet = latest_forebet_prediction(db, match.id)
    goal_profile = build_goal_parameter_profile(db, match, latest_forebet)
    three_season_summary = build_three_season_summary(db, match)
    home_standing = latest_standing_before_match(db, match, match.home_team_id)
    away_standing = latest_standing_before_match(db, match, match.away_team_id)
    standings_count = db.scalar(
        select(func.count(StandingsSnapshot.id)).where(
            StandingsSnapshot.competition_id == match.competition_id,
            StandingsSnapshot.season_id == match.season_id,
            StandingsSnapshot.matchday == (home_standing.matchday if home_standing else match.matchday),
        )
    )

    if not home_standing or not away_standing or not standings_count or standings_count < 2:
        return MatchAnalytics(
            match_id=match.id,
            status="insufficient_data",
            reliability="insufficient",
            explanation="No hay clasificacion previa suficiente anterior al partido para calcular el indice.",
            inputs={},
            latest_forebet=latest_forebet,
            goal_parameter_profile=goal_profile,
            three_season_summary=three_season_summary,
        )

    home_relative = relative_position(home_standing.position, standings_count)
    away_relative = relative_position(away_standing.position, standings_count)
    home_balance = goal_balance(home_standing.goals_for, home_standing.goals_against, home_standing.played)
    away_balance = goal_balance(away_standing.goals_for, away_standing.goals_against, away_standing.played)
    home_activity = goal_activity(home_standing.goals_for, home_standing.goals_against, home_standing.played)
    away_activity = goal_activity(away_standing.goals_for, away_standing.goals_against, away_standing.played)
    home_form = _recent_form(db, match, match.home_team_id)
    away_form = _recent_form(db, match, match.away_team_id)
    form_factor = _form_similarity(home_form, away_form)
    venue_factor, favorite_context = _venue_favorite_factor(home_standing, away_standing)
    score_home_standing, score_away_standing, score_range_reference_reason = _score_range_reference_standings(
        db,
        match,
        home_standing,
        away_standing,
    )
    score_range = _score_range_projection(match, score_home_standing, score_away_standing, score_range_reference_reason)

    inputs = ClosedMidtableInputs(
        home_centrality_distance=centrality_distance(home_relative),
        away_centrality_distance=centrality_distance(away_relative),
        classification_distance=classification_distance(home_standing.position, away_standing.position),
        home_goal_balance_abs=abs(home_balance),
        away_goal_balance_abs=abs(away_balance),
        home_goal_activity=home_activity,
        away_goal_activity=away_activity,
        reliability_factor=0.7 if min(home_standing.played, away_standing.played) >= 7 else 0.35,
        form_factor=form_factor,
        venue_factor=venue_factor,
    )
    settings = get_statistical_config(db).value
    index = closed_midtable_index(inputs, settings.closed_midtable_weights.model_dump())
    sample_proxy = int(standings_count)
    reliability = historical_sample_reliability(sample_proxy)
    explanation = (
        f"Ambos equipos se evaluan con la clasificacion previa al partido. "
        f"Las posiciones son {home_standing.position} y {away_standing.position}; "
        f"la diferencia de clasificacion entre equipos es de {inputs.classification_distance} puestos. "
        f"La diferencia goleadora media por partido, calculada como goles a favor menos goles en contra dividido por partidos jugados, "
        f"es {home_balance:.2f} para {match.home_team.name} y {away_balance:.2f} para {match.away_team.name}; "
        f"si sale negativa, el equipo encaja mas goles de los que marca por partido. "
        f"La forma reciente se compara con factor {form_factor:.2f}: "
        f"{match.home_team.name} suma {home_form['points']} puntos en {home_form['matches']} partidos recientes "
        f"y {match.away_team.name} suma {away_form['points']} en {away_form['matches']}. "
        f"La localia se interpreta asi: {favorite_context}. "
        f"El indice de equilibrio del partido es {index:.2f}/100. "
        "No hay datos de lesionados importados; por ahora el indice sin lesiones y el indice con lesiones neutrales coinciden. "
        "La formula usa los pesos configurados actualmente y sigue siendo provisional."
    )

    return MatchAnalytics(
        match_id=match.id,
        status="ok",
        closed_midtable_index=index,
        reliability=reliability,
        explanation=explanation,
        inputs={
            "home_relative_position": round(home_relative, 4),
            "away_relative_position": round(away_relative, 4),
            "classification_position_gap": inputs.classification_distance,
            "home_goal_balance": round(home_balance, 4),
            "away_goal_balance": round(away_balance, 4),
            "home_goal_activity": round(home_activity, 4),
            "away_goal_activity": round(away_activity, 4),
            "home_recent_form": home_form,
            "away_recent_form": away_form,
            "recent_form_similarity_factor": round(form_factor, 4),
            "venue_favorite_factor": round(venue_factor, 4),
            "favorite_context": favorite_context,
            "injury_data_status": "missing",
            "injury_adjustment": 0,
            "closed_midtable_index_without_injuries": index,
            "closed_midtable_index_with_neutral_injuries": index,
            "teams_in_table": standings_count,
            "configured_minimum_sample_size": settings.minimum_sample_size,
            "configured_alert_threshold": settings.alert_threshold,
            "configured_weights": settings.closed_midtable_weights.model_dump(),
            "score_range": score_range,
        },
        latest_forebet=latest_forebet,
        goal_parameter_profile=goal_profile,
        three_season_summary=three_season_summary,
    )


def build_three_season_summary(db: Session, match: Match) -> ThreeSeasonSummary:
    season_rows = list(
        db.execute(
            select(Season.id, Season.name)
            .where(Season.competition_id == match.competition_id)
            .order_by(desc(Season.name))
            .limit(3)
        ).all()
    )
    season_ids = [row[0] for row in season_rows]
    season_names = [row[1] for row in season_rows]
    head_to_head_matches = list(
        db.scalars(
            select(Match).where(
                Match.competition_id == match.competition_id,
                Match.season_id.in_(season_ids),
                Match.home_score.is_not(None),
                Match.away_score.is_not(None),
                (
                    (Match.home_team_id == match.home_team_id) & (Match.away_team_id == match.away_team_id)
                )
                | (
                    (Match.home_team_id == match.away_team_id) & (Match.away_team_id == match.home_team_id)
                ),
            )
            .order_by(desc(Match.match_date))
        ).all()
    )
    matches = len(head_to_head_matches)
    goal_totals = [(row.home_score or 0) + (row.away_score or 0) for row in head_to_head_matches]
    total_goals = sum(goal_totals)
    goals_per_match = round(total_goals / matches, 2) if matches else 0.0
    goals_variance = _population_variance(goal_totals)
    goals_standard_deviation = round(goals_variance**0.5, 2)
    under_25_matches = sum(1 for total in goal_totals if total < 2.5)
    over_25_matches = sum(1 for total in goal_totals if total > 2.5)
    under_25_percentage = round((under_25_matches / matches) * 100, 2) if matches else 0.0
    over_25_percentage = round((over_25_matches / matches) * 100, 2) if matches else 0.0
    direct_matches = [_direct_match_result(row, match) for row in head_to_head_matches]
    reference_season = _reference_season_for_match(db, match)
    home_reference = _reference_standing(db, reference_season, match.home_team_id) if reference_season else None
    away_reference = _reference_standing(db, reference_season, match.away_team_id) if reference_season else None
    reason = (
        "temporada en curso porque el partido es posterior a la jornada 5"
        if (match.matchday or 0) > 5
        else "temporada anterior porque el partido esta en las primeras cinco jornadas"
    )
    sample_note = _head_to_head_sample_note(matches)
    explanation = (
        f"{sample_note} "
        f"Se han encontrado {matches} partidos entre estos dos equipos, contando casa y fuera. "
        f"Se resumen los enfrentamientos directos entre {match.home_team.name} y {match.away_team.name} en las ultimas {len(season_names)} temporadas disponibles: {', '.join(season_names)}. "
        f"El historico directo suma {total_goals} goles en {matches} partidos, con promedio de {goals_per_match} goles por partido. "
        f"La varianza de goles por partido es {goals_variance} y la desviacion tipica es {goals_standard_deviation}. "
        f"En el cruce directo hay {under_25_matches} partidos under 2.5 y {over_25_matches} partidos over 2.5. "
        f"Para posiciones y diferencia goleadora se usa {reference_season.name if reference_season else 'sin temporada de referencia'}: {reason}."
    )
    return ThreeSeasonSummary(
        seasons=season_names,
        matches=matches,
        total_goals=total_goals,
        goals_per_match=goals_per_match,
        goals_variance=goals_variance,
        goals_standard_deviation=goals_standard_deviation,
        under_25_matches=under_25_matches,
        over_25_matches=over_25_matches,
        under_25_percentage=under_25_percentage,
        over_25_percentage=over_25_percentage,
        reference_season=reference_season.name if reference_season else None,
        reference_reason=reason,
        home_standing=home_reference,
        away_standing=away_reference,
        direct_matches=direct_matches,
        explanation=explanation,
    )


def _population_variance(values: list[int]) -> float:
    if not values:
        return 0.0
    mean = sum(values) / len(values)
    return round(sum((value - mean) ** 2 for value in values) / len(values), 2)


def _direct_match_result(source_match: Match, reference_match: Match) -> DirectMatchResult:
    return DirectMatchResult(
        id=source_match.id,
        match_date=source_match.match_date,
        season=source_match.season.name if source_match.season else "",
        home_team=source_match.home_team.name if source_match.home_team else str(source_match.home_team_id),
        away_team=source_match.away_team.name if source_match.away_team else str(source_match.away_team_id),
        home_score=source_match.home_score,
        away_score=source_match.away_score,
        venue_context="same_home" if source_match.home_team_id == reference_match.home_team_id else "reversed_home",
    )


def _head_to_head_sample_note(matches: int) -> str:
    if matches >= 3:
        return "Hay al menos tres enfrentamientos directos disponibles para este cruce."
    if matches == 2:
        return "Aviso: no tenemos tres enfrentamientos directos disponibles para este cruce; solo hay dos."
    if matches == 1:
        return "Aviso: no tenemos tres enfrentamientos directos disponibles para este cruce; solo hay uno."
    return "Aviso: no tenemos enfrentamientos directos disponibles para este cruce en las temporadas cargadas."


def _reference_season_for_match(db: Session, match: Match) -> Season | None:
    if (match.matchday or 0) > 5:
        return match.season
    return db.scalar(
        select(Season)
        .where(Season.competition_id == match.competition_id, Season.name < match.season.name)
        .order_by(desc(Season.name))
        .limit(1)
    )


def _reference_standing(db: Session, season: Season | None, team_id: int) -> TeamReferenceStanding | None:
    if not season:
        return None
    standing = db.scalar(
        select(StandingsSnapshot)
        .where(StandingsSnapshot.season_id == season.id, StandingsSnapshot.team_id == team_id)
        .order_by(desc(StandingsSnapshot.matchday), desc(StandingsSnapshot.snapshot_date))
        .limit(1)
    )
    if not standing:
        return None
    team = db.get(Team, team_id)
    return TeamReferenceStanding(
        team_id=team_id,
        team=team.name if team else str(team_id),
        season=season.name,
        matchday=standing.matchday,
        position=standing.position,
        played=standing.played,
        goals_for=standing.goals_for,
        goals_against=standing.goals_against,
        goal_difference=standing.goal_difference,
        points=standing.points,
    )


def _recent_form(db: Session, match: Match, team_id: int, limit: int = 5) -> dict:
    rows = list(
        db.scalars(
            select(Match)
            .where(
                Match.competition_id == match.competition_id,
                Match.match_date < match.match_date,
                Match.home_score.is_not(None),
                Match.away_score.is_not(None),
                (Match.home_team_id == team_id) | (Match.away_team_id == team_id),
            )
            .order_by(desc(Match.match_date))
            .limit(limit)
        ).all()
    )
    wins = draws = losses = goals_for = goals_against = points = unbeaten = 0
    for row in rows:
        is_home = row.home_team_id == team_id
        scored = row.home_score if is_home else row.away_score
        conceded = row.away_score if is_home else row.home_score
        goals_for += scored or 0
        goals_against += conceded or 0
        if scored is None or conceded is None:
            continue
        if scored > conceded:
            wins += 1
            points += 3
            unbeaten += 1
        elif scored == conceded:
            draws += 1
            points += 1
            unbeaten += 1
        else:
            losses += 1
    played = len(rows)
    return {
        "matches": played,
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "points": points,
        "points_per_match": round(points / played, 2) if played else 0,
        "win_rate": round(wins / played, 3) if played else 0,
        "unbeaten_rate": round(unbeaten / played, 3) if played else 0,
        "goal_difference": goals_for - goals_against,
    }


def _form_similarity(home_form: dict, away_form: dict) -> float:
    if home_form["matches"] == 0 or away_form["matches"] == 0:
        return 0.5
    home_strength = _form_strength(home_form)
    away_strength = _form_strength(away_form)
    return round(max(0.0, min(1.0, 1 - abs(home_strength - away_strength))), 4)


def _form_strength(form: dict) -> float:
    points_score = min(form["points_per_match"] / 3, 1)
    goal_score = max(0.0, min(1.0, 0.5 + (form["goal_difference"] / max(form["matches"], 1)) / 4))
    return (points_score * 0.45) + (form["unbeaten_rate"] * 0.25) + (form["win_rate"] * 0.15) + (goal_score * 0.15)


def _venue_favorite_factor(home_standing: StandingsSnapshot, away_standing: StandingsSnapshot) -> tuple[float, str]:
    position_gap = abs(home_standing.position - away_standing.position)
    points_gap = abs(home_standing.points - away_standing.points)
    if position_gap <= 1 and points_gap <= 3:
        return 0.65, "no hay favorito claro por clasificacion; la localia se trata como factor moderado"
    if home_standing.position < away_standing.position or home_standing.points > away_standing.points:
        return 0.35, "el favorito juega en casa, lo que reduce el equilibrio esperado"
    return 0.75, "el favorito juega fuera, por lo que la localia del rival compensa parcialmente"


def _score_range_reference_standings(
    db: Session,
    match: Match,
    home_standing: StandingsSnapshot,
    away_standing: StandingsSnapshot,
) -> tuple[StandingsSnapshot, StandingsSnapshot, str]:
    if (match.matchday or 0) > 5 and home_standing.played > 0 and away_standing.played > 0:
        return home_standing, away_standing, "temporada en curso porque el partido es posterior a la jornada 5"
    reference_season = _reference_season_for_match(db, match)
    if not reference_season:
        return home_standing, away_standing, "clasificacion previa disponible de la temporada en curso"
    reference_rows = list(
        db.scalars(
            select(StandingsSnapshot)
            .where(
                StandingsSnapshot.season_id == reference_season.id,
                StandingsSnapshot.team_id.in_([match.home_team_id, match.away_team_id]),
            )
            .order_by(desc(StandingsSnapshot.matchday), desc(StandingsSnapshot.snapshot_date))
        ).all()
    )
    latest_by_team: dict[int, StandingsSnapshot] = {}
    for row in reference_rows:
        latest_by_team.setdefault(row.team_id, row)
    return (
        latest_by_team.get(match.home_team_id, home_standing),
        latest_by_team.get(match.away_team_id, away_standing),
        "temporada anterior porque el partido esta en las primeras cinco jornadas",
    )


def _score_range_projection(match: Match, home_standing: StandingsSnapshot, away_standing: StandingsSnapshot, reference_reason: str) -> dict:
    home_stats = _team_goal_average_inputs(match.home_team.name, home_standing)
    away_stats = _team_goal_average_inputs(match.away_team.name, away_standing)
    home_expected = round((home_stats["scored_per_match"] + away_stats["conceded_per_match"]) / 2, 2)
    away_expected = round((away_stats["scored_per_match"] + home_stats["conceded_per_match"]) / 2, 2)
    home_range = _integer_goal_range(home_expected)
    away_range = _integer_goal_range(away_expected)
    possible_scores = [
        f"{home_goals}-{away_goals}"
        for home_goals in range(home_range["min"], home_range["max"] + 1)
        for away_goals in range(away_range["min"], away_range["max"] + 1)
    ]
    return {
        "home_team": match.home_team.name,
        "away_team": match.away_team.name,
        "home": home_stats,
        "away": away_stats,
        "home_expected_goals": home_expected,
        "away_expected_goals": away_expected,
        "home_integer_range": home_range,
        "away_integer_range": away_range,
        "reference_reason": reference_reason,
        "summary": f"{match.home_team.name} {home_range['min']}-{home_range['max']} goles / {match.away_team.name} {away_range['min']}-{away_range['max']} goles",
        "possible_scores": possible_scores,
        "explanation": (
            f"Para {match.home_team.name} se cruza su media de goles marcados con la media de goles recibidos de {match.away_team.name}. "
            f"Para {match.away_team.name} se cruza su media de goles marcados con la media de goles recibidos de {match.home_team.name}. "
            "El promedio resultante se pasa a un rango entero con redondeo inferior y superior."
        ),
    }


def _team_goal_average_inputs(team_name: str, standing: StandingsSnapshot) -> dict:
    played = max(standing.played, 1)
    return {
        "team": team_name,
        "played": standing.played,
        "goals_for": standing.goals_for,
        "goals_against": standing.goals_against,
        "scored_per_match": round(standing.goals_for / played, 2),
        "conceded_per_match": round(standing.goals_against / played, 2),
    }


def _integer_goal_range(value: float) -> dict[str, int]:
    minimum = max(0, math.floor(value))
    maximum = max(minimum, math.ceil(value))
    return {"min": minimum, "max": maximum}


def build_goal_parameter_profile(
    db: Session,
    match: Match,
    latest_forebet: ForebetPrediction | None = None,
) -> GoalParameterProfile:
    competition = match.competition
    competition_type = competition.competition_type if competition and competition.competition_type else _infer_competition_type(competition.name if competition else "")
    is_friendly = bool(match.is_friendly or competition_type == "friendly")
    home = _team_goal_parameter(db, match, match.home_team_id, match.home_team.name, "home")
    away = _team_goal_parameter(db, match, match.away_team_id, match.away_team.name, "away")
    rows = [item for item in (home, away) if item]
    sample_size = sum(item.sample_size for item in rows)
    has_minute_sample = sample_size > 0 and len(rows) == 2
    early_rate = sum(item.early_scored_per_match for item in rows) / len(rows) if has_minute_sample else 0.0
    late_rate = sum(item.late_scored_per_match + item.late_conceded_per_match for item in rows) / len(rows) if has_minute_sample else 0.0
    actual_total = match.home_score + match.away_score if match.home_score is not None and match.away_score is not None else None
    expected_goals = float(latest_forebet.expected_goals) if latest_forebet and latest_forebet.expected_goals is not None else None
    volume_reference = actual_total if actual_total is not None else expected_goals
    goal_volume_bucket = _goal_volume_bucket(volume_reference)
    under_over_profile = _under_over_profile(volume_reference, latest_forebet.over_under_prediction if latest_forebet else None)
    reliability = historical_sample_reliability(sample_size)
    statistical_weight = 0.35 if is_friendly else 1.0
    early_signal = _rate_signal(early_rate, high=0.35, medium=0.18, label="goles tempranos") if has_minute_sample else "sin datos de minutos de gol"
    late_signal = _rate_signal(late_rate, high=0.65, medium=0.35, label="goles tardios") if has_minute_sample else "sin datos de minutos de gol"
    minute_explanation = (
        f"Las senales de minutos son {early_signal} y {late_signal}. "
        if has_minute_sample
        else "No hay minutos de gol importados suficientes para valorar si los equipos marcan mas al inicio o al final. "
    )
    explanation = (
        f"Perfil {competition_type}; {'amistoso con peso reducido' if is_friendly else 'partido oficial con peso completo'}. "
        f"El volumen se clasifica como {goal_volume_bucket} y el patron under/over como {under_over_profile}. "
        f"{minute_explanation}"
        "Estos parametros describen asociaciones historicas de goles, no causalidad."
    )
    return GoalParameterProfile(
        competition_type=competition_type,
        is_friendly=is_friendly,
        statistical_weight=statistical_weight,
        total_goals=actual_total,
        expected_goals=round(expected_goals, 2) if expected_goals is not None else None,
        goal_volume_bucket=goal_volume_bucket,
        under_over_profile=under_over_profile,
        early_goal_signal=early_signal,
        late_goal_signal=late_signal,
        sample_size=sample_size,
        reliability=reliability,
        explanation=explanation,
        home=home,
        away=away,
    )


def _team_goal_parameter(db: Session, match: Match, team_id: int, team_name: str, venue_type: str) -> TeamGoalParameter | None:
    rows = list(
        db.scalars(
            select(TeamGoalTiming)
            .where(
                TeamGoalTiming.team_id == team_id,
                TeamGoalTiming.competition_id == match.competition_id,
                TeamGoalTiming.season_id == match.season_id,
                TeamGoalTiming.venue_type.in_([venue_type, "all"]),
            )
            .order_by(desc(TeamGoalTiming.calculated_at))
        ).all()
    )
    latest_at = rows[0].calculated_at if rows else None
    latest_rows = [row for row in rows if row.calculated_at == latest_at] if latest_at else []
    if not latest_rows:
        return None
    sample_size = max((row.matches_played for row in latest_rows), default=0)
    return TeamGoalParameter(
        team_id=team_id,
        team=team_name,
        venue_type=venue_type,
        sample_size=sample_size,
        early_scored_per_match=round(_interval_goals_per_match(latest_rows, "scored", 0, 15), 3),
        late_scored_per_match=round(_interval_goals_per_match(latest_rows, "scored", 75, 120), 3),
        late_conceded_per_match=round(_interval_goals_per_match(latest_rows, "conceded", 75, 120), 3),
        total_scored=sum(row.goals_scored for row in latest_rows),
        total_conceded=sum(row.goals_conceded for row in latest_rows),
    )


def _interval_goals_per_match(rows: list[TeamGoalTiming], field: str, start: int, end: int) -> float:
    selected = [
        row
        for row in rows
        if row.interval_start is not None
        and row.interval_end is not None
        and row.interval_start >= start
        and row.interval_end <= end
    ]
    goals = sum(row.goals_scored if field == "scored" else row.goals_conceded for row in selected)
    matches = max((row.matches_played for row in selected), default=0)
    return goals / matches if matches else 0.0


def _goal_volume_bucket(total_or_expected: float | int | None) -> str:
    if total_or_expected is None:
        return "sin_marcador"
    if total_or_expected <= 2:
        return "bajo"
    if total_or_expected < 4:
        return "medio"
    return "alto"


def _under_over_profile(total_or_expected: float | int | None, forebet_under_over: str | None) -> str:
    if forebet_under_over:
        return forebet_under_over
    if total_or_expected is None:
        return "sin_senal"
    return "under_2_5" if total_or_expected < 2.5 else "over_2_5"


def _rate_signal(rate: float, high: float, medium: float, label: str) -> str:
    if label == "goles tardios":
        if rate >= high:
            return "muchos goles en el tramo final"
        if rate >= medium:
            return "algunos goles en el tramo final"
        return "pocos goles en el tramo final"
    if label == "goles tempranos":
        if rate >= high:
            return "muchos goles en el inicio"
        if rate >= medium:
            return "algunos goles en el inicio"
        return "pocos goles en el inicio"
    if rate >= high:
        return f"alta presencia de {label}"
    if rate >= medium:
        return f"presencia media de {label}"
    return f"baja presencia de {label}"


def _infer_competition_type(name: str) -> str:
    normalized = name.lower()
    if "friendly" in normalized or "amistoso" in normalized:
        return "friendly"
    if any(token in normalized for token in ("champions", "europa", "libertadores", "continental")):
        return "continental"
    if "cup" in normalized or "copa" in normalized:
        return "domestic_cup"
    return "domestic_league"


def latest_forebet_prediction(db: Session, match_id: int) -> ForebetPrediction | None:
    return db.scalar(
        select(ForebetPrediction)
        .where(ForebetPrediction.match_id == match_id)
        .order_by(desc(ForebetPrediction.captured_at))
        .limit(1)
    )


def latest_standing_before_match(db: Session, match: Match, team_id: int) -> StandingsSnapshot | None:
    return db.scalar(
        select(StandingsSnapshot)
        .where(
            StandingsSnapshot.competition_id == match.competition_id,
            StandingsSnapshot.season_id == match.season_id,
            StandingsSnapshot.team_id == team_id,
            StandingsSnapshot.snapshot_date <= match.match_date,
        )
        .order_by(desc(StandingsSnapshot.snapshot_date))
        .limit(1)
    )


def player_stadium_analytics(db: Session, player_id: int, stadium_id: int | None = None) -> list[PlayerStadiumAnalytics]:
    player = db.get(Player, player_id)
    if not player:
        return []

    query = select(PlayerMatchStats, Stadium).outerjoin(Stadium, PlayerMatchStats.stadium_id == Stadium.id).where(
        PlayerMatchStats.player_id == player_id
    )
    if stadium_id is not None:
        query = query.where(PlayerMatchStats.stadium_id == stadium_id)

    grouped: dict[int | None, list[tuple[PlayerMatchStats, Stadium | None]]] = {}
    for stats, stadium in db.execute(query).all():
        grouped.setdefault(stats.stadium_id, []).append((stats, stadium))

    return [_summarize_player_stadium(player, key, rows) for key, rows in grouped.items()]


def stadium_players_analytics(db: Session, stadium_id: int) -> StadiumPlayerAnalytics | None:
    stadium = db.get(Stadium, stadium_id)
    if not stadium:
        return None
    player_rows = db.execute(
        select(Player.id).join(PlayerMatchStats, PlayerMatchStats.player_id == Player.id).where(
            PlayerMatchStats.stadium_id == stadium_id
        )
    ).all()
    player_ids = sorted({row[0] for row in player_rows})
    players = []
    for player_id in player_ids:
        players.extend(player_stadium_analytics(db, player_id, stadium_id))
    players.sort(key=lambda item: item.goal_participations_per_90, reverse=True)
    return StadiumPlayerAnalytics(stadium_id=stadium.id, stadium=stadium.name, players=players)


def _summarize_player_stadium(
    player: Player,
    stadium_id: int | None,
    rows: list[tuple[PlayerMatchStats, Stadium | None]],
) -> PlayerStadiumAnalytics:
    stats_rows = [row[0] for row in rows]
    stadium = rows[0][1] if rows else None
    minutes = sum(item.minutes_played for item in stats_rows)
    goals = sum(item.goals for item in stats_rows)
    assists = sum(item.assists for item in stats_rows)
    ratings = [float(item.rating) for item in stats_rows if item.rating is not None]
    return PlayerStadiumAnalytics(
        player_id=player.id,
        player=player.full_name,
        stadium_id=stadium_id,
        stadium=stadium.name if stadium else None,
        matches=len(stats_rows),
        starts=sum(1 for item in stats_rows if item.started),
        minutes=minutes,
        goals=goals,
        assists=assists,
        goal_participations_per_90=round(per_90(goals + assists, minutes), 2),
        goals_per_90=round(per_90(goals, minutes), 2),
        assists_per_90=round(per_90(assists, minutes), 2),
        average_rating=round(sum(ratings) / len(ratings), 2) if ratings else None,
        reliability=player_minutes_reliability(minutes),
    )
