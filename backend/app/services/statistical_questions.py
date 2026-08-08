from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from difflib import SequenceMatcher
from statistics import mean

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Competition,
    GoalMoment,
    LiveMatchObservation,
    Match,
    MatchIncident,
    Player,
    PlayerMatchStats,
    Season,
    StandingsSnapshot,
    Team,
    TeamAlias,
)
from app.utils.normalization import normalize_name


@dataclass(frozen=True)
class MatchSignalRow:
    match_id: int
    match_date: str
    home_team_id: int
    away_team_id: int
    home_team: str
    away_team: str
    home_score: int
    away_score: int
    total_goals: int
    signal: str


def answer_statistical_question(db: Session, question: str) -> dict:
    normalized_question = normalize_name(question)
    if not normalized_question:
        return _base_answer(
            question,
            "Escribe una pregunta estadistica para consultar la base de partidos.",
            question_type="unsupported",
            data_status="unsupported",
        )

    handlers = (
        (_is_red_card_goal_question, _answer_goal_after_red_card),
        (_is_favorite_margin_question, _answer_favorite_odds_margin),
        (_is_shots_per_goal_question, _answer_shots_on_target_per_goal),
        (_is_team_shots_question, _answer_team_shots_on_target),
        (_is_cards_league_question, _answer_league_cards),
        (_is_season_ratio_question, _answer_season_over_season),
        (_is_live_75_shots_question, _answer_live_low_shots),
        (_is_after_draw_next_ht_question, _answer_after_00_next_first_half),
        (_is_player_vs_team_question, _answer_player_vs_team),
        (_is_league_goals_question, _answer_league_goals_per_match),
        (_is_under_over_question, _answer_under_over_streaks),
    )
    for matcher, handler in handlers:
        if matcher(normalized_question):
            return handler(db, question, normalized_question)

    return _base_answer(
        question,
        (
            "Aun no interpreto esa formulacion. Prueba una de las plantillas: ligas con mas/menos goles, "
            "disparos a puerta por equipo, disparos por gol, gol tras roja, ratio vs temporada anterior, "
            "en vivo al 75' con pocos tiros, favorito <=1,50 y margen +2, liga tarjetera, jugador vs equipo, "
            "tras 0-0 el siguiente sin gol en 1a parte, o rachas under/over 2,5."
        ),
        question_type="unsupported",
        data_status="unsupported",
    )


def _is_under_over_question(normalized: str) -> bool:
    compact = normalized.replace(",", ".")
    return "under" in normalized or "over" in normalized or "2.5" in compact or "2 5" in normalized


def _is_league_goals_question(normalized: str) -> bool:
    return ("liga" in normalized or "competicion" in normalized or "competencia" in normalized) and (
        "gol" in normalized or "goles" in normalized
    )


def _is_team_shots_question(normalized: str) -> bool:
    if _is_shots_per_goal_question(normalized):
        return False
    return ("dispar" in normalized or "tiro" in normalized) and (
        "puerta" in normalized or "porteria" in normalized or "arco" in normalized
    )


def _is_shots_per_goal_question(normalized: str) -> bool:
    has_shots = "dispar" in normalized or "tiro" in normalized
    return has_shots and (
        "para marcar" in normalized
        or "por gol" in normalized
        or "necesitan" in normalized
        or ("marcar un gol" in normalized)
    )


def _is_red_card_goal_question(normalized: str) -> bool:
    return ("roja" in normalized or "rojo" in normalized or "expuls" in normalized) and "gol" in normalized


def _is_season_ratio_question(normalized: str) -> bool:
    return ("temporada anterior" in normalized or "ano anterior" in normalized or "año anterior" in normalized) or (
        "ratio" in normalized and ("temporada" in normalized or "anterior" in normalized)
    )


def _is_live_75_shots_question(normalized: str) -> bool:
    return ("75" in normalized or "minuto 75" in normalized) and (
        "dispar" in normalized or "tiro" in normalized or "vivo" in normalized or "directo" in normalized
    )


def _is_favorite_margin_question(normalized: str) -> bool:
    has_odds = "1.50" in normalized.replace(",", ".") or "1 50" in normalized or "cuota" in normalized
    return has_odds and ("gol" in normalized or "diferencia" in normalized or "favorito" in normalized)


def _is_cards_league_question(normalized: str) -> bool:
    return ("tarjet" in normalized or "tarjeter" in normalized) and (
        "liga" in normalized or "competicion" in normalized or "competencia" in normalized or "mas" in normalized or "menos" in normalized
    )


def _is_player_vs_team_question(normalized: str) -> bool:
    return ("jugador" in normalized or "jugadores" in normalized) and (
        "equipo" in normalized or "rival" in normalized or "contra" in normalized or "frente" in normalized
    )


def _is_after_draw_next_ht_question(normalized: str) -> bool:
    has_draw = "0 0" in normalized or "cero a cero" in normalized or "0 a 0" in normalized
    has_follow = (
        "siguiente" in normalized
        or "proximo" in normalized
        or "primer tiempo" in normalized
        or "primera parte" in normalized
        or "1a parte" in normalized
    )
    return has_draw and has_follow


def _answer_under_over_streaks(db: Session, question: str, normalized_question: str) -> dict:
    team = _find_team_in_question(db, normalized_question)
    rows = _finished_matches_for_question(db, team.id if team else None)
    if not rows:
        scope = team.name if team else "la base completa"
        return _base_answer(
            question,
            f"No hay partidos terminados suficientes para calcular rachas de {scope}.",
            question_type="under_over_streak",
            data_status="missing_data",
            scope=scope,
            matched_team=team.name if team else None,
            missing_requirements=["Importa resultados CSV o sincroniza ligas con FootyStats/SofaScore."],
        )

    if team is None:
        return _answer_global_team_streaks(question, rows)

    under_streak = _streak_summary(rows, "under_2_5")
    over_streak = _streak_summary(rows, "over_2_5")
    scope = team.name
    answer = (
        f"En {scope}, la racha actual under 2,5 es de {under_streak['current']} partidos y la racha maxima es "
        f"de {under_streak['maximum']}. La racha actual over 2,5 es de {over_streak['current']} partidos y la "
        f"racha maxima es de {over_streak['maximum']}. La muestra usada es de {len(rows)} partidos terminados."
    )
    return _base_answer(
        question,
        answer,
        question_type="under_over_streak",
        scope=scope,
        matched_team=team.name,
        sample_size=len(rows),
        under_25=under_streak,
        over_25=over_streak,
        recent_matches=[row.__dict__ for row in sorted(rows, key=lambda item: item.match_date, reverse=True)[:10]],
    )


def _answer_league_goals_per_match(db: Session, question: str, normalized_question: str) -> dict:
    home_team = Team.__table__.alias("home_team")
    away_team = Team.__table__.alias("away_team")
    rows = db.execute(
        select(Match, Competition.name, home_team.c.name, away_team.c.name)
        .join(Competition, Match.competition_id == Competition.id)
        .join(home_team, Match.home_team_id == home_team.c.id)
        .join(away_team, Match.away_team_id == away_team.c.id)
        .where(Match.home_score.is_not(None), Match.away_score.is_not(None))
    ).all()
    if not rows:
        return _missing(
            question,
            "league_goals_per_match",
            "No hay partidos terminados para calcular goles por liga.",
            ["Importa results-csv o sincroniza competiciones."],
        )

    buckets: dict[str, list[int]] = defaultdict(list)
    recent = []
    for match, competition_name, home_name, away_name in rows:
        total = int(match.home_score or 0) + int(match.away_score or 0)
        buckets[competition_name].append(total)
        recent.append(
            {
                "match_id": match.id,
                "match_date": match.match_date.isoformat(),
                "home_team": home_name,
                "away_team": away_name,
                "home_score": int(match.home_score or 0),
                "away_score": int(match.away_score or 0),
                "total_goals": total,
                "signal": competition_name,
            }
        )

    rankings = []
    for index, (name, goals) in enumerate(
        sorted(buckets.items(), key=lambda item: (mean(item[1]), len(item[1])), reverse=True),
        start=1,
    ):
        avg = round(mean(goals), 3)
        with_goals_pct = round(sum(1 for value in goals if value > 0) / len(goals) * 100, 1)
        rankings.append(
            {
                "rank": index,
                "label": name,
                "value": avg,
                "unit": "goles/partido",
                "detail": f"{with_goals_pct}% partidos con al menos 1 gol",
                "sample_size": len(goals),
            }
        )

    top = rankings[0]
    bottom = rankings[-1]
    answer = (
        f"La liga con mas goles por partido es {top['label']} ({top['value']}). "
        f"La que menos marca es {bottom['label']} ({bottom['value']}). "
        f"Muestra: {len(rows)} partidos en {len(rankings)} competiciones."
    )
    return _base_answer(
        question,
        answer,
        question_type="league_goals_per_match",
        scope="competiciones con partidos terminados",
        sample_size=len(rows),
        rankings=rankings,
        metrics={
            "most_goals_league": top["label"],
            "most_goals_avg": top["value"],
            "least_goals_league": bottom["label"],
            "least_goals_avg": bottom["value"],
        },
        recent_matches=sorted(recent, key=lambda item: item["match_date"], reverse=True)[:10],
    )


def _answer_team_shots_on_target(db: Session, question: str, normalized_question: str) -> dict:
    competition = _find_competition_in_question(db, normalized_question)
    rows = _team_shot_aggregates(db, competition.id if competition else None)
    if not rows:
        return _missing(
            question,
            "team_shots_on_target",
            "No hay disparos a puerta por equipo en la base.",
            [
                "Importa player-stats-csv con columnas shots_on_target (o sincroniza stats de FootyStats/SofaScore).",
            ],
            matched_competition=competition.name if competition else None,
        )

    rankings = [
        {
            "rank": index,
            "label": f"{row['team']} · {row['competition']}",
            "value": row["shots_on_target_per_match"],
            "unit": "a puerta/partido",
            "detail": f"{row['shots_on_target']} tiros a puerta en {row['matches']} partidos",
            "sample_size": row["matches"],
        }
        for index, row in enumerate(rows, start=1)
    ]
    top, bottom = rankings[0], rankings[-1]
    scope = competition.name if competition else "todas las competiciones con stats de tiros"
    answer = (
        f"En {scope}, mas disparan a puerta: {top['label']} ({top['value']}/partido). "
        f"Menos: {bottom['label']} ({bottom['value']}/partido)."
    )
    return _base_answer(
        question,
        answer,
        question_type="team_shots_on_target",
        scope=scope,
        matched_competition=competition.name if competition else None,
        sample_size=sum(row["matches"] for row in rows),
        rankings=rankings,
        metrics={"teams_ranked": len(rankings)},
    )


def _answer_shots_on_target_per_goal(db: Session, question: str, normalized_question: str) -> dict:
    competition = _find_competition_in_question(db, normalized_question)
    rows = _team_shot_aggregates(db, competition.id if competition else None)
    scored = [row for row in rows if row["goals"] > 0 and row["shots_on_target"] is not None]
    if not scored:
        return _missing(
            question,
            "shots_on_target_per_goal",
            "No hay suficientes goles y disparos a puerta para calcular el ratio.",
            ["Importa player-stats-csv con shots_on_target y goals."],
            matched_competition=competition.name if competition else None,
        )

    ordered = sorted(scored, key=lambda row: (row["shots_per_goal"], -row["goals"]), reverse=True)
    rankings = [
        {
            "rank": index,
            "label": f"{row['team']} · {row['competition']}",
            "value": row["shots_per_goal"],
            "unit": "a puerta/gol",
            "detail": f"{row['shots_on_target']} a puerta / {row['goals']} goles",
            "sample_size": row["matches"],
        }
        for index, row in enumerate(ordered, start=1)
    ]
    top, bottom = rankings[0], rankings[-1]
    scope = competition.name if competition else "equipos con goles y tiros a puerta"
    answer = (
        f"Mas tiros a puerta por gol: {top['label']} ({top['value']}). "
        f"Mas eficientes: {bottom['label']} ({bottom['value']})."
    )
    return _base_answer(
        question,
        answer,
        question_type="shots_on_target_per_goal",
        scope=scope,
        matched_competition=competition.name if competition else None,
        sample_size=sum(row["matches"] for row in ordered),
        rankings=rankings,
    )


def _answer_goal_after_red_card(db: Session, question: str, normalized_question: str) -> dict:
    incidents = list(db.scalars(select(MatchIncident)).all())
    by_match: dict[int, list[MatchIncident]] = defaultdict(list)
    for incident in incidents:
        by_match[incident.match_id].append(incident)

    evaluated = 0
    with_goal_after = 0
    recent = []
    for match_id, rows in by_match.items():
        reds = [row for row in rows if "red" in row.incident_type]
        goals = [row for row in rows if "goal" in row.incident_type]
        if not reds:
            continue
        evaluated += 1
        goal_after = any(goal.minute > red.minute for red in reds for goal in goals)
        if goal_after:
            with_goal_after += 1
            recent.append(match_id)

    if evaluated > 0:
        percentage = round(with_goal_after / evaluated * 100, 1)
        return _base_answer(
            question,
            (
                f"En el {percentage}% de los partidos con tarjeta roja cronometrada "
                f"({with_goal_after}/{evaluated}) hubo al menos un gol despues de la expulsion."
            ),
            question_type="goal_after_red_card",
            scope="match_incident (roja + gol con minuto)",
            sample_size=evaluated,
            metrics={
                "matches_with_red": evaluated,
                "matches_with_goal_after_red": with_goal_after,
                "percentage": percentage,
            },
        )

    # Fallback proxy from match-level red counts (Football-Data / player stats).
    match_rows = db.scalars(
        select(Match).where(
            Match.home_score.is_not(None),
            Match.away_score.is_not(None),
            or_(
                func.coalesce(Match.home_red_cards, 0) > 0,
                func.coalesce(Match.away_red_cards, 0) > 0,
            ),
        )
    ).all()
    if not match_rows:
        player_reds = db.execute(
            select(PlayerMatchStats.match_id)
            .group_by(PlayerMatchStats.match_id)
            .having(func.sum(PlayerMatchStats.red_cards) > 0)
        ).all()
        match_ids = [row[0] for row in player_reds]
        match_rows = db.scalars(select(Match).where(Match.id.in_(match_ids))).all() if match_ids else []

    if not match_rows:
        return _missing(
            question,
            "goal_after_red_card",
            "No hay tarjetas rojas ni incidentes cronometrados para medir goles posteriores.",
            [
                "Importa Football-Data enriquecido (rojas por partido) o match-incidents-csv con minuto.",
                "Ideal: SofaScore incidents via Crawlora para saber si el gol fue despues de la roja.",
            ],
        )

    with_goal = sum(1 for match in match_rows if (match.home_score or 0) + (match.away_score or 0) > 0)
    percentage = round(with_goal / len(match_rows) * 100, 1)
    return _base_answer(
        question,
        (
            f"Proxy con rojas a nivel de partido: en {percentage}% de {len(match_rows)} partidos con roja "
            "tambien hubo algun gol. Importa match-incidents-csv para medir estrictamente 'gol despues de la roja'."
        ),
        question_type="goal_after_red_card",
        data_status="partial",
        scope="match.home/away_red_cards",
        sample_size=len(match_rows),
        metrics={"matches_with_red": len(match_rows), "matches_with_any_goal": with_goal, "percentage": percentage},
        missing_requirements=["match-incidents-csv (minuto de roja y goles) para respuesta exacta"],
    )


def _answer_season_over_season(db: Session, question: str, normalized_question: str) -> dict:
    competition = _find_competition_in_question(db, normalized_question)
    by_comp: dict[int, list[Season]] = defaultdict(list)
    season_query = select(Season).order_by(Season.name.desc(), Season.start_date.desc(), Season.id.desc())
    if competition is not None:
        season_query = season_query.where(Season.competition_id == competition.id)
    for season in db.scalars(season_query).all():
        by_comp[season.competition_id].append(season)

    pair = None
    if competition is not None:
        pair = by_comp.get(competition.id)
    if not pair or len(pair) < 2:
        pair = next((items for items in by_comp.values() if len(items) >= 2), None)
        if pair:
            competition = db.get(Competition, pair[0].competition_id)

    if not pair or len(pair) < 2:
        return _missing(
            question,
            "season_over_season",
            "Hace falta al menos dos temporadas cargadas en la misma competicion para comparar ratios.",
            ["Importa standings/results de temporada actual y anterior."],
            matched_competition=competition.name if competition else None,
        )

    current, previous = pair[0], pair[1]
    current_rows = _standing_team_rows(db, current.id)
    previous_rows = _standing_team_rows(db, previous.id)
    if not current_rows or not previous_rows:
        return _missing(
            question,
            "season_over_season",
            "Hay temporadas, pero faltan clasificaciones para comparar puntos/goles.",
            ["Importa standings-csv de ambas temporadas."],
            matched_competition=competition.name if competition else None,
        )

    previous_by_team = {row["team_id"]: row for row in previous_rows}
    comparisons = []
    for row in current_rows:
        prior = previous_by_team.get(row["team_id"])
        if not prior or prior["played"] <= 0 or row["played"] <= 0:
            continue
        comparisons.append(
            {
                "team": row["team"],
                "points_delta_per_match": round(row["points"] / row["played"] - prior["points"] / prior["played"], 3),
                "goals_delta_per_match": round(row["goals_for"] / row["played"] - prior["goals_for"] / prior["played"], 3),
                "current_points_per_match": round(row["points"] / row["played"], 3),
                "previous_points_per_match": round(prior["points"] / prior["played"], 3),
            }
        )

    if not comparisons:
        return _missing(
            question,
            "season_over_season",
            "No hay equipos presentes en ambas temporadas para calcular ratios.",
            ["Asegura los mismos equipos en standings de ambas temporadas."],
            matched_competition=competition.name if competition else None,
        )

    by_points = sorted(comparisons, key=lambda item: item["points_delta_per_match"], reverse=True)
    by_goals = sorted(comparisons, key=lambda item: item["goals_delta_per_match"], reverse=True)
    rankings = [
        {
            "rank": index,
            "label": item["team"],
            "value": item["points_delta_per_match"],
            "unit": "pts/partido vs ant.",
            "detail": (
                f"Goles/partido Δ {item['goals_delta_per_match']:+} · "
                f"{item['current_points_per_match']} vs {item['previous_points_per_match']} pts/p"
            ),
            "sample_size": None,
        }
        for index, item in enumerate(by_points, start=1)
    ]
    shot_note = "Disparos a puerta vs temporada anterior: faltan stats de tiros en ambas temporadas."
    shot_rows_current = _team_shot_aggregates(db, competition.id if competition else None, season_id=current.id)
    shot_rows_previous = _team_shot_aggregates(db, competition.id if competition else None, season_id=previous.id)
    data_status = "partial"
    if shot_rows_current and shot_rows_previous:
        prev_shots = {row["team"]: row["shots_on_target_per_match"] for row in shot_rows_previous}
        shot_deltas = []
        for row in shot_rows_current:
            if row["team"] in prev_shots:
                shot_deltas.append((row["team"], row["shots_on_target_per_match"] - prev_shots[row["team"]]))
        if shot_deltas:
            shot_deltas.sort(key=lambda item: item[1], reverse=True)
            shot_note = (
                f"A puerta: mejor Δ {shot_deltas[0][0]} ({shot_deltas[0][1]:+.2f}/p); "
                f"peor Δ {shot_deltas[-1][0]} ({shot_deltas[-1][1]:+.2f}/p)."
            )
            data_status = "ok"

    scope = f"{competition.name if competition else 'competicion'}: {current.name} vs {previous.name}"
    answer = (
        f"Mejor ratio de puntos/partido vs temporada anterior: {by_points[0]['team']} "
        f"({by_points[0]['points_delta_per_match']:+}). Peor: {by_points[-1]['team']} "
        f"({by_points[-1]['points_delta_per_match']:+}). "
        f"En goles/partido: mejor {by_goals[0]['team']} ({by_goals[0]['goals_delta_per_match']:+}), "
        f"peor {by_goals[-1]['team']} ({by_goals[-1]['goals_delta_per_match']:+}). {shot_note}"
    )
    return _base_answer(
        question,
        answer,
        question_type="season_over_season",
        data_status=data_status,
        scope=scope,
        matched_competition=competition.name if competition else None,
        sample_size=len(comparisons),
        rankings=rankings,
        metrics={
            "current_season": current.name,
            "previous_season": previous.name,
            "best_points_team": by_points[0]["team"],
            "worst_points_team": by_points[-1]["team"],
        },
        missing_requirements=[] if data_status == "ok" else ["player-stats con shots_on_target en ambas temporadas"],
    )


def _answer_live_low_shots(db: Session, question: str, normalized_question: str) -> dict:
    observations = list(
        db.scalars(
            select(LiveMatchObservation)
            .where(
                LiveMatchObservation.minute.is_not(None),
                LiveMatchObservation.minute >= 70,
                LiveMatchObservation.minute <= 85,
            )
            .order_by(LiveMatchObservation.observed_at.desc())
        ).all()
    )
    low_rows = []
    seen_events: set[int] = set()
    for observation in observations:
        if observation.provider_event_id in seen_events:
            continue
        if observation.home_shots_on_target is None and observation.away_shots_on_target is None:
            continue
        seen_events.add(observation.provider_event_id)
        total_sot = int(observation.home_shots_on_target or 0) + int(observation.away_shots_on_target or 0)
        if total_sot < 1:
            low_rows.append(observation)

    if low_rows or observations:
        rankings = [
            {
                "rank": index,
                "label": f"{row.home_team} vs {row.away_team}",
                "value": float(row.minute or 0),
                "unit": "minuto",
                "detail": (
                    f"SOT {int(row.home_shots_on_target or 0)}-{int(row.away_shots_on_target or 0)} · "
                    f"{row.competition or 'Live'}"
                ),
                "sample_size": 1,
            }
            for index, row in enumerate(low_rows[:25], start=1)
        ]
        answer = (
            f"En observaciones live cerca del 75', {len(low_rows)} partidos tenian menos de 1 tiro a puerta "
            f"(muestra observada: {len(seen_events)})."
            if seen_events
            else "Hay observaciones live, pero aun sin tiros a puerta capturados en el snapshot."
        )
        return _base_answer(
            question,
            answer,
            question_type="live_low_shots_75",
            data_status="ok" if seen_events else "partial",
            scope="live_match_observation (min 70-85)",
            sample_size=len(seen_events),
            rankings=rankings,
            metrics={"low_shot_matches": len(low_rows), "observed_matches": len(seen_events)},
            missing_requirements=[] if seen_events else ["Snapshots SofaScore con tiros a puerta"],
        )

    # Live pull through Crawlora when configured.
    try:
        from app.services.sofascore_crawlora_provider import fetch_event_snapshot, fetch_live_events

        live = fetch_live_events("football")
    except Exception as exc:  # noqa: BLE001
        return _missing(
            question,
            "live_low_shots_75",
            f"No hay observaciones guardadas y no se pudo consultar SofaScore live ({exc}).",
            ["Configura CRAWLORA_API_KEY en Vercel y refresca Partidos en directo / Flashscore."],
        )

    candidates = [event for event in live.events if event.minute is not None and 70 <= event.minute <= 85]
    low = []
    checked = 0
    for event in candidates[:20]:
        try:
            snapshot = fetch_event_snapshot(event.event_id)
        except Exception:  # noqa: BLE001
            continue
        checked += 1
        total_sot = int(snapshot.home_shots_on_target or 0) + int(snapshot.away_shots_on_target or 0)
        db.add(
            LiveMatchObservation(
                provider="sofascore",
                provider_event_id=event.event_id,
                observed_at=datetime.now(UTC),
                minute=event.minute,
                status=event.status,
                home_team=event.home_team,
                away_team=event.away_team,
                competition=event.competition,
                home_score=event.home_score,
                away_score=event.away_score,
                home_shots_on_target=snapshot.home_shots_on_target,
                away_shots_on_target=snapshot.away_shots_on_target,
                home_shots=snapshot.home_shots,
                away_shots=snapshot.away_shots,
            )
        )
        if total_sot < 1:
            low.append(event)
    db.commit()

    rankings = [
        {
            "rank": index,
            "label": f"{event.home_team} vs {event.away_team}",
            "value": float(event.minute or 0),
            "unit": "minuto",
            "detail": event.competition or "Live",
            "sample_size": 1,
        }
        for index, event in enumerate(low, start=1)
    ]
    return _base_answer(
        question,
        (
            f"Consulta live SofaScore: {len(low)} de {checked} partidos entre el 70' y 85' "
            "tienen menos de 1 disparo a puerta combinado."
        ),
        question_type="live_low_shots_75",
        scope="SofaScore live + event statistics",
        sample_size=checked,
        rankings=rankings,
        metrics={"low_shot_matches": len(low), "checked_matches": checked, "candidates": len(candidates)},
    )


def _answer_favorite_odds_margin(db: Session, question: str, normalized_question: str) -> dict:
    matches = db.scalars(
        select(Match).where(
            Match.home_score.is_not(None),
            Match.away_score.is_not(None),
            or_(Match.home_odds.is_not(None), Match.away_odds.is_not(None)),
        )
    ).all()
    evaluated = 0
    hits = 0
    for match in matches:
        home_odds = float(match.home_odds) if match.home_odds is not None else None
        away_odds = float(match.away_odds) if match.away_odds is not None else None
        if home_odds is None and away_odds is None:
            continue
        if home_odds is not None and (away_odds is None or home_odds <= away_odds):
            favorite_odds, favorite_score, other_score = home_odds, int(match.home_score or 0), int(match.away_score or 0)
        else:
            favorite_odds, favorite_score, other_score = float(away_odds or 99), int(match.away_score or 0), int(match.home_score or 0)
        if favorite_odds > 1.5:
            continue
        evaluated += 1
        if favorite_score - other_score >= 2:
            hits += 1

    if evaluated == 0:
        return _missing(
            question,
            "favorite_odds_margin",
            "No hay partidos con cuota 1X2 y resultado final para medir favoritos <= 1,50.",
            ["Importa Football-Data enriquecido (AvgH/B365H) o captura Flashscore y guarda el resultado."],
        )

    percentage = round(hits / evaluated * 100, 1)
    return _base_answer(
        question,
        (
            f"En favoritos con cuota <= 1,50, el {percentage}% ({hits}/{evaluated}) acabo con "
            "2 o mas goles de diferencia a favor del favorito."
        ),
        question_type="favorite_odds_margin",
        scope="match.home_odds/away_odds + resultado final",
        sample_size=evaluated,
        metrics={"favorites_le_150": evaluated, "margin_plus_2": hits, "percentage": percentage},
    )


def _answer_league_cards(db: Session, question: str, normalized_question: str) -> dict:
    rows = db.execute(
        select(
            Competition.name,
            Match.id,
            func.coalesce(Match.home_yellow_cards, 0)
            + func.coalesce(Match.away_yellow_cards, 0)
            + func.coalesce(Match.home_red_cards, 0)
            + func.coalesce(Match.away_red_cards, 0),
        )
        .join(Competition, Match.competition_id == Competition.id)
        .where(
            or_(
                Match.home_yellow_cards.is_not(None),
                Match.away_yellow_cards.is_not(None),
                Match.home_red_cards.is_not(None),
                Match.away_red_cards.is_not(None),
            )
        )
    ).all()
    if not rows:
        # Fallback to player stats aggregation.
        rows = db.execute(
            select(
                Competition.name,
                PlayerMatchStats.match_id,
                func.sum(PlayerMatchStats.yellow_cards + PlayerMatchStats.red_cards),
            )
            .join(Competition, PlayerMatchStats.competition_id == Competition.id)
            .group_by(Competition.name, PlayerMatchStats.match_id)
        ).all()
    if not rows:
        return _missing(
            question,
            "league_cards",
            "No hay tarjetas a nivel de partido ni en player_match_stats.",
            ["Importa Football-Data enriquecido o player-stats-csv con yellow/red cards."],
        )

    by_league: dict[str, list[int]] = defaultdict(list)
    for competition_name, _match_id, cards in rows:
        by_league[competition_name].append(int(cards or 0))

    rankings = []
    for index, (name, values) in enumerate(
        sorted(by_league.items(), key=lambda item: (mean(item[1]), len(item[1])), reverse=True),
        start=1,
    ):
        rankings.append(
            {
                "rank": index,
                "label": name,
                "value": round(mean(values), 3),
                "unit": "tarjetas/partido",
                "detail": f"{sum(values)} tarjetas en {len(values)} partidos con stats",
                "sample_size": len(values),
            }
        )
    top, bottom = rankings[0], rankings[-1]
    answer = (
        f"Liga mas tarjetera: {top['label']} ({top['value']} tarjetas/partido). "
        f"Menos: {bottom['label']} ({bottom['value']})."
    )
    return _base_answer(
        question,
        answer,
        question_type="league_cards",
        scope="competiciones con tarjetas en match/player stats",
        sample_size=len(rows),
        rankings=rankings,
        metrics={"most_cards_league": top["label"], "least_cards_league": bottom["label"]},
    )


def _answer_player_vs_team(db: Session, question: str, normalized_question: str) -> dict:
    team = _find_team_in_question(db, normalized_question)
    query = (
        select(
            Player.full_name,
            Team.name,
            func.sum(PlayerMatchStats.goals),
            func.sum(PlayerMatchStats.assists),
            func.sum(PlayerMatchStats.minutes_played),
            func.count(PlayerMatchStats.id),
            func.avg(PlayerMatchStats.rating),
        )
        .join(Player, PlayerMatchStats.player_id == Player.id)
        .join(Team, PlayerMatchStats.opponent_team_id == Team.id)
        .group_by(Player.full_name, Team.name)
        .having(func.sum(PlayerMatchStats.minutes_played) >= 1)
    )
    if team is not None:
        query = query.where(PlayerMatchStats.opponent_team_id == team.id)
    rows = db.execute(query).all()
    if not rows:
        return _missing(
            question,
            "player_vs_team",
            "No hay estadisticas de jugador contra rivales para responder.",
            ["Importa player-stats-csv (o sync) con opponent_team."],
            matched_team=team.name if team else None,
        )

    enriched = []
    for full_name, opponent, goals, assists, minutes, appearances, rating in rows:
        minutes_i = int(minutes or 0)
        goals_i = int(goals or 0)
        goals_per_90 = round(goals_i * 90 / minutes_i, 3) if minutes_i else 0.0
        enriched.append(
            {
                "player": full_name,
                "opponent": opponent,
                "goals": goals_i,
                "assists": int(assists or 0),
                "minutes": minutes_i,
                "appearances": int(appearances or 0),
                "goals_per_90": goals_per_90,
                "rating": round(float(rating), 2) if rating is not None else None,
            }
        )
    enriched.sort(key=lambda item: (item["goals_per_90"], item["goals"], item["rating"] or 0), reverse=True)
    rankings = [
        {
            "rank": index,
            "label": f"{row['player']} vs {row['opponent']}",
            "value": row["goals_per_90"],
            "unit": "goles/90",
            "detail": (
                f"{row['goals']} goles · {row['assists']} asist. · {row['appearances']} partidos"
                + (f" · nota {row['rating']}" if row["rating"] is not None else "")
            ),
            "sample_size": row["appearances"],
        }
        for index, row in enumerate(enriched[:25], start=1)
    ]
    scope = f"vs {team.name}" if team else "jugadores vs rivales (top por goles/90)"
    best, worst = enriched[0], enriched[-1]
    answer = (
        f"Mejor registro: {best['player']} vs {best['opponent']} ({best['goals_per_90']} goles/90). "
        f"Peor de la muestra: {worst['player']} vs {worst['opponent']} ({worst['goals_per_90']} goles/90)."
    )
    return _base_answer(
        question,
        answer,
        question_type="player_vs_team",
        scope=scope,
        matched_team=team.name if team else None,
        sample_size=len(enriched),
        rankings=rankings,
    )


def _answer_after_00_next_first_half(db: Session, question: str, normalized_question: str) -> dict:
    competition = _find_competition_in_question(db, normalized_question)
    home_team = Team.__table__.alias("home_team")
    away_team = Team.__table__.alias("away_team")
    query = (
        select(Match, home_team.c.name, away_team.c.name)
        .join(home_team, Match.home_team_id == home_team.c.id)
        .join(away_team, Match.away_team_id == away_team.c.id)
        .where(Match.home_score.is_not(None), Match.away_score.is_not(None))
        .order_by(Match.competition_id, Match.match_date, Match.id)
    )
    if competition is not None:
        query = query.where(Match.competition_id == competition.id)
    matches = db.execute(query).all()
    if len(matches) < 2:
        return _missing(
            question,
            "after_00_next_first_half",
            "No hay suficientes partidos para encadenar un 0-0 con el siguiente de la competicion.",
            ["Importa results-csv de la liga y, para 1a parte, goal-moments-csv."],
            matched_competition=competition.name if competition else None,
        )

    by_competition: dict[int, list] = defaultdict(list)
    for match, home_name, away_name in matches:
        by_competition[match.competition_id].append((match, home_name, away_name))

    moments = {
        match_id
        for match_id, in db.execute(
            select(GoalMoment.match_id).where(GoalMoment.minute <= 45)
        ).all()
    }
    has_any_moments = bool(db.scalar(select(func.count()).select_from(GoalMoment)))

    evaluated = 0
    known = 0
    no_first_half_goal = 0
    recent = []
    for competition_matches in by_competition.values():
        for index, (match, _home, _away) in enumerate(competition_matches[:-1]):
            if int(match.home_score or 0) != 0 or int(match.away_score or 0) != 0:
                continue
            nxt, nxt_home, nxt_away = competition_matches[index + 1]
            evaluated += 1
            first_half_goal: bool | None
            if nxt.home_ht_score is not None and nxt.away_ht_score is not None:
                first_half_goal = (int(nxt.home_ht_score) + int(nxt.away_ht_score)) > 0
            elif has_any_moments:
                first_half_goal = nxt.id in moments
            else:
                first_half_goal = None
            if first_half_goal is not None:
                known += 1
                if first_half_goal is False:
                    no_first_half_goal += 1
            recent.append(
                {
                    "match_id": nxt.id,
                    "match_date": nxt.match_date.isoformat(),
                    "home_team": nxt_home,
                    "away_team": nxt_away,
                    "home_score": int(nxt.home_score or 0),
                    "away_score": int(nxt.away_score or 0),
                    "total_goals": int(nxt.home_score or 0) + int(nxt.away_score or 0),
                    "signal": "no_first_half_goal" if first_half_goal is False else (
                        "first_half_goal" if first_half_goal else "unknown_first_half"
                    ),
                }
            )

    if evaluated == 0:
        return _missing(
            question,
            "after_00_next_first_half",
            "No hay partidos 0-0 con un siguiente partido en la misma competicion.",
            ["Amplia el historico de results-csv / Football-Data."],
            matched_competition=competition.name if competition else None,
        )

    if known == 0:
        return _base_answer(
            question,
            (
                f"Encontre {evaluated} secuencias 0-0 → siguiente partido, pero faltan marcadores HT "
                "o goal moments para saber si hubo gol en la 1a parte del siguiente."
            ),
            question_type="after_00_next_first_half",
            data_status="partial",
            scope=competition.name if competition else "competiciones cargadas",
            matched_competition=competition.name if competition else None,
            sample_size=evaluated,
            recent_matches=recent[:10],
            metrics={"zero_zero_sequences": evaluated},
            missing_requirements=["Importa Football-Data con HTHG/HTAG o goal-moments-csv."],
        )

    percentage = round(no_first_half_goal / known * 100, 1)
    answer = (
        f"Tras un 0-0, en el {percentage}% de los casos conocidos ({no_first_half_goal}/{known}) "
        "el siguiente partido de esa competicion no tuvo gol en la primera parte."
    )
    return _base_answer(
        question,
        answer,
        question_type="after_00_next_first_half",
        scope=competition.name if competition else "competiciones cargadas",
        matched_competition=competition.name if competition else None,
        sample_size=known,
        metrics={
            "zero_zero_sequences": evaluated,
            "sequences_with_first_half_data": known,
            "next_without_first_half_goal": no_first_half_goal,
            "percentage": percentage,
        },
        recent_matches=recent[:10],
    )


def _team_shot_aggregates(
    db: Session,
    competition_id: int | None = None,
    season_id: int | None = None,
) -> list[dict]:
    home_team = Team.__table__.alias("home_team")
    away_team = Team.__table__.alias("away_team")
    match_query = (
        select(Match, Competition.name, home_team.c.id, home_team.c.name, away_team.c.id, away_team.c.name)
        .join(Competition, Match.competition_id == Competition.id)
        .join(home_team, Match.home_team_id == home_team.c.id)
        .join(away_team, Match.away_team_id == away_team.c.id)
        .where(or_(Match.home_shots_on_target.is_not(None), Match.away_shots_on_target.is_not(None)))
    )
    if competition_id is not None:
        match_query = match_query.where(Match.competition_id == competition_id)
    if season_id is not None:
        match_query = match_query.where(Match.season_id == season_id)
    match_rows = db.execute(match_query).all()

    buckets: dict[tuple[int, str, str], dict] = {}
    if match_rows:
        for match, competition_name, home_id, home_name, away_id, away_name in match_rows:
            sides = (
                (home_id, home_name, match.home_shots_on_target, match.home_score),
                (away_id, away_name, match.away_shots_on_target, match.away_score),
            )
            for team_id, team_name, sot, goals in sides:
                if sot is None:
                    continue
                key = (team_id, team_name, competition_name)
                bucket = buckets.setdefault(
                    key,
                    {
                        "team_id": team_id,
                        "team": team_name,
                        "competition": competition_name,
                        "matches": 0,
                        "shots_on_target": 0,
                        "goals": 0,
                    },
                )
                bucket["matches"] += 1
                bucket["shots_on_target"] += int(sot or 0)
                bucket["goals"] += int(goals or 0)
    else:
        query = (
            select(
                Team.id,
                Team.name,
                Competition.name,
                PlayerMatchStats.match_id,
                func.sum(PlayerMatchStats.shots_on_target),
                func.sum(PlayerMatchStats.goals),
            )
            .join(Team, PlayerMatchStats.team_id == Team.id)
            .join(Competition, PlayerMatchStats.competition_id == Competition.id)
            .where(PlayerMatchStats.shots_on_target.is_not(None))
            .group_by(Team.id, Team.name, Competition.name, PlayerMatchStats.match_id)
        )
        if competition_id is not None:
            query = query.where(PlayerMatchStats.competition_id == competition_id)
        if season_id is not None:
            query = query.where(PlayerMatchStats.season_id == season_id)
        for team_id, team_name, competition_name, _match_id, sot, goals in db.execute(query).all():
            key = (team_id, team_name, competition_name)
            bucket = buckets.setdefault(
                key,
                {
                    "team_id": team_id,
                    "team": team_name,
                    "competition": competition_name,
                    "matches": 0,
                    "shots_on_target": 0,
                    "goals": 0,
                },
            )
            bucket["matches"] += 1
            bucket["shots_on_target"] += int(sot or 0)
            bucket["goals"] += int(goals or 0)

    rows = []
    for bucket in buckets.values():
        matches = bucket["matches"]
        sot = bucket["shots_on_target"]
        goals = bucket["goals"]
        rows.append(
            {
                **bucket,
                "shots_on_target_per_match": round(sot / matches, 3) if matches else 0.0,
                "shots_per_goal": round(sot / goals, 3) if goals else None,
            }
        )
    rows.sort(key=lambda item: (item["shots_on_target_per_match"], item["shots_on_target"]), reverse=True)
    return rows


def _standing_team_rows(db: Session, season_id: int) -> list[dict]:
    latest_matchday = db.scalar(
        select(func.max(StandingsSnapshot.matchday)).where(StandingsSnapshot.season_id == season_id)
    )
    if latest_matchday is None:
        return []
    rows = db.execute(
        select(StandingsSnapshot, Team.name)
        .join(Team, StandingsSnapshot.team_id == Team.id)
        .where(StandingsSnapshot.season_id == season_id, StandingsSnapshot.matchday == latest_matchday)
    ).all()
    return [
        {
            "team_id": snapshot.team_id,
            "team": team_name,
            "played": snapshot.played,
            "points": snapshot.points,
            "goals_for": snapshot.goals_for,
        }
        for snapshot, team_name in rows
    ]


def _find_team_in_question(db: Session, normalized_question: str) -> Team | None:
    teams = list(db.scalars(select(Team)).all())
    aliases = db.execute(select(TeamAlias.team_id, TeamAlias.normalized_alias)).all()
    alias_by_team: dict[int, list[str]] = {}
    for team_id, alias in aliases:
        alias_by_team.setdefault(team_id, []).append(alias)

    best_team: Team | None = None
    best_score = 0.0
    for team in teams:
        candidates = [team.normalized_name, *alias_by_team.get(team.id, [])]
        for candidate in candidates:
            if not candidate:
                continue
            score = _name_score(normalized_question, candidate)
            if score > best_score:
                best_score = score
                best_team = team
    return best_team if best_score >= 0.72 else None


def _find_competition_in_question(db: Session, normalized_question: str) -> Competition | None:
    best: Competition | None = None
    best_score = 0.0
    for competition in db.scalars(select(Competition)).all():
        score = _name_score(normalized_question, competition.normalized_name)
        if score > best_score:
            best_score = score
            best = competition
    return best if best_score >= 0.72 else None


def _name_score(question: str, candidate: str) -> float:
    if candidate in question:
        return 1.0
    question_tokens = set(question.split())
    candidate_tokens = set(candidate.split())
    if candidate_tokens and candidate_tokens.issubset(question_tokens):
        return 0.96
    token_overlap = len(question_tokens & candidate_tokens) / max(len(candidate_tokens), 1)
    similarity = SequenceMatcher(None, question, candidate).ratio()
    return max(token_overlap * 0.9, similarity)


def _finished_matches_for_question(db: Session, team_id: int | None) -> list[MatchSignalRow]:
    home_team = Team.__table__.alias("home_team")
    away_team = Team.__table__.alias("away_team")
    query = (
        select(Match, home_team.c.name, away_team.c.name)
        .join(home_team, Match.home_team_id == home_team.c.id)
        .join(away_team, Match.away_team_id == away_team.c.id)
        .where(Match.home_score.is_not(None), Match.away_score.is_not(None))
        .order_by(Match.match_date)
    )
    if team_id is not None:
        query = query.where(or_(Match.home_team_id == team_id, Match.away_team_id == team_id))

    rows: list[MatchSignalRow] = []
    seen: set[tuple] = set()
    for match, home_name, away_name in db.execute(query).all():
        identity = (
            match.competition_id,
            match.season_id,
            match.match_date.isoformat(),
            match.home_team_id,
            match.away_team_id,
            match.home_score,
            match.away_score,
        )
        if identity in seen:
            continue
        seen.add(identity)
        total_goals = int(match.home_score or 0) + int(match.away_score or 0)
        rows.append(
            MatchSignalRow(
                match_id=match.id,
                match_date=match.match_date.isoformat(),
                home_team_id=match.home_team_id,
                away_team_id=match.away_team_id,
                home_team=home_name,
                away_team=away_name,
                home_score=int(match.home_score or 0),
                away_score=int(match.away_score or 0),
                total_goals=total_goals,
                signal="over_2_5" if total_goals > 2 else "under_2_5",
            )
        )
    return rows


def _answer_global_team_streaks(question: str, rows: list[MatchSignalRow]) -> dict:
    team_rows: dict[int, list[MatchSignalRow]] = {}
    team_names: dict[int, str] = {}
    for row in rows:
        team_rows.setdefault(row.home_team_id, []).append(row)
        team_rows.setdefault(row.away_team_id, []).append(row)
        team_names[row.home_team_id] = row.home_team
        team_names[row.away_team_id] = row.away_team

    under_streak = _best_team_streak(team_rows, team_names, "under_2_5")
    over_streak = _best_team_streak(team_rows, team_names, "over_2_5")
    scope = "todos los partidos cargados, agrupados por equipo"
    answer = (
        "En todos los partidos cargados no mezclo partidos de equipos y ligas distintas en una sola racha. "
        f"Buscando por equipo, la mayor racha under 2,5 es de {under_streak['maximum']} partidos"
        f"{_owner_suffix(under_streak.get('maximum_owner'))}. La mayor racha over 2,5 es de "
        f"{over_streak['maximum']} partidos{_owner_suffix(over_streak.get('maximum_owner'))}. "
        f"La muestra usada es de {len(rows)} partidos terminados."
    )
    return _base_answer(
        question,
        answer,
        question_type="under_over_streak",
        scope=scope,
        sample_size=len(rows),
        under_25=under_streak,
        over_25=over_streak,
        recent_matches=[row.__dict__ for row in sorted(rows, key=lambda item: item.match_date, reverse=True)[:10]],
    )


def _best_team_streak(team_rows: dict[int, list[MatchSignalRow]], team_names: dict[int, str], signal: str) -> dict:
    summaries = []
    for team_id, rows in team_rows.items():
        ordered_rows = sorted(rows, key=lambda row: (row.match_date, row.match_id))
        summary = _streak_summary(ordered_rows, signal)
        summary["team"] = team_names.get(team_id, "Equipo sin nombre")
        summaries.append(summary)

    if not summaries:
        return _empty_streak()

    best_maximum = max(summaries, key=lambda item: (item["maximum"], item["total"], item["team"]))
    best_current = max(summaries, key=lambda item: (item["current"], item["total"], item["team"]))
    appearances = sum(len(rows) for rows in team_rows.values())
    total = sum(summary["total"] for summary in summaries)
    percentage = round(total / appearances * 100, 1) if appearances else 0.0
    return {
        "signal": signal,
        "current": best_current["current"],
        "maximum": best_maximum["maximum"],
        "total": total,
        "percentage": percentage,
        "current_owner": best_current["team"] if best_current["current"] > 0 else None,
        "maximum_owner": best_maximum["team"] if best_maximum["maximum"] > 0 else None,
        "scope": "equipos",
    }


def _owner_suffix(owner: str | None) -> str:
    return f" ({owner})" if owner else ""


def _streak_summary(rows: list[MatchSignalRow], signal: str) -> dict:
    current = 0
    for row in reversed(rows):
        if row.signal != signal:
            break
        current += 1

    maximum = 0
    running = 0
    for row in rows:
        if row.signal == signal:
            running += 1
            maximum = max(maximum, running)
        else:
            running = 0

    total = sum(1 for row in rows if row.signal == signal)
    percentage = round(total / len(rows) * 100, 1) if rows else 0.0
    return {
        "signal": signal,
        "current": current,
        "maximum": maximum,
        "total": total,
        "percentage": percentage,
    }


def _empty_streak() -> dict:
    return {"signal": "", "current": 0, "maximum": 0, "total": 0, "percentage": 0.0}


def _missing(
    question: str,
    question_type: str,
    message: str,
    requirements: list[str],
    matched_team: str | None = None,
    matched_competition: str | None = None,
) -> dict:
    return _base_answer(
        question,
        message,
        question_type=question_type,
        data_status="missing_data",
        scope="faltan datos",
        matched_team=matched_team,
        matched_competition=matched_competition,
        missing_requirements=requirements,
    )


def _base_answer(
    question: str,
    answer: str,
    *,
    question_type: str = "under_over_streak",
    data_status: str = "ok",
    scope: str = "sin calcular",
    matched_team: str | None = None,
    matched_competition: str | None = None,
    sample_size: int = 0,
    under_25: dict | None = None,
    over_25: dict | None = None,
    rankings: list[dict] | None = None,
    metrics: dict | None = None,
    recent_matches: list[dict] | None = None,
    missing_requirements: list[str] | None = None,
) -> dict:
    return {
        "question": question,
        "answer": answer,
        "scope": scope,
        "question_type": question_type,
        "data_status": data_status,
        "matched_team": matched_team,
        "matched_competition": matched_competition,
        "sample_size": sample_size,
        "under_25": under_25 or _empty_streak(),
        "over_25": over_25 or _empty_streak(),
        "rankings": rankings or [],
        "metrics": metrics or {},
        "recent_matches": recent_matches or [],
        "missing_requirements": missing_requirements or [],
    }
