from dataclasses import dataclass
from difflib import SequenceMatcher

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Match, Team, TeamAlias
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
        return _unsupported_answer(question, "Escribe una pregunta estadistica para consultar la base de partidos.")

    if not _mentions_under_over(normalized_question):
        return _unsupported_answer(
            question,
            "Por ahora interpreto preguntas de rachas under 2,5 y over 2,5. Ejemplo: cuantos under 2,5 seguidos lleva Getafe.",
        )

    team = _find_team_in_question(db, normalized_question)
    rows = _finished_matches_for_question(db, team.id if team else None)
    if not rows:
        scope = team.name if team else "la base completa"
        return {
            "question": question,
            "answer": f"No hay partidos terminados suficientes para calcular rachas de {scope}.",
            "scope": scope,
            "matched_team": team.name if team else None,
            "sample_size": 0,
            "under_25": _empty_streak(),
            "over_25": _empty_streak(),
            "recent_matches": [],
        }

    if team is None:
        return _answer_global_team_streaks(question, rows)

    under_streak = _streak_summary(rows, "under_2_5")
    over_streak = _streak_summary(rows, "over_2_5")
    scope = team.name if team else "todos los partidos cargados"
    answer = (
        f"En {scope}, la racha actual under 2,5 es de {under_streak['current']} partidos y la racha maxima es "
        f"de {under_streak['maximum']}. La racha actual over 2,5 es de {over_streak['current']} partidos y la "
        f"racha maxima es de {over_streak['maximum']}. La muestra usada es de {len(rows)} partidos terminados."
    )
    return {
        "question": question,
        "answer": answer,
        "scope": scope,
        "matched_team": team.name if team else None,
        "sample_size": len(rows),
        "under_25": under_streak,
        "over_25": over_streak,
        "recent_matches": [row.__dict__ for row in sorted(rows, key=lambda item: item.match_date, reverse=True)[:10]],
    }


def _mentions_under_over(normalized_question: str) -> bool:
    compact = normalized_question.replace(",", ".")
    return "under" in normalized_question or "over" in normalized_question or "2.5" in compact or "2 5" in normalized_question


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
    return {
        "question": question,
        "answer": answer,
        "scope": scope,
        "matched_team": None,
        "sample_size": len(rows),
        "under_25": under_streak,
        "over_25": over_streak,
        "recent_matches": [row.__dict__ for row in sorted(rows, key=lambda item: item.match_date, reverse=True)[:10]],
    }


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


def _unsupported_answer(question: str, message: str) -> dict:
    return {
        "question": question,
        "answer": message,
        "scope": "sin calcular",
        "matched_team": None,
        "sample_size": 0,
        "under_25": _empty_streak(),
        "over_25": _empty_streak(),
        "recent_matches": [],
    }
