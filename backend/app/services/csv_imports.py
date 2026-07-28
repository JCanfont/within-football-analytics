import csv
from datetime import UTC, date, datetime
from decimal import Decimal
from io import StringIO
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Competition,
    ForebetPrediction,
    GoalMoment,
    Match,
    Player,
    PlayerMatchStats,
    Season,
    Stadium,
    StandingsSnapshot,
    Team,
    TeamGoalTiming,
)
from app.schemas.imports import ImportErrorDetail, ImportResult
from app.utils.normalization import normalize_name


def import_standings_csv(db: Session, raw_csv: bytes) -> ImportResult:
    result = ImportResult(import_type="standings_csv")
    for row_number, row in _iter_rows(raw_csv):
        try:
            competition = _get_or_create_competition(db, row["competition"], row.get("country"), row.get("competition_type"))
            season = _get_or_create_season(db, competition, row["season"])
            team = _get_or_create_team(db, row["team"], row.get("country"))
            snapshot_date = _parse_datetime(row["snapshot_date"])
            matchday = _to_int(row["matchday"])
            existing = db.scalar(
                select(StandingsSnapshot).where(
                    StandingsSnapshot.competition_id == competition.id,
                    StandingsSnapshot.season_id == season.id,
                    StandingsSnapshot.team_id == team.id,
                    StandingsSnapshot.matchday == matchday,
                    StandingsSnapshot.snapshot_date == snapshot_date,
                )
            )
            if existing:
                result.skipped += 1
                continue
            goals_for = _to_int(row["goals_for"])
            goals_against = _to_int(row["goals_against"])
            db.add(
                StandingsSnapshot(
                    competition_id=competition.id,
                    season_id=season.id,
                    team_id=team.id,
                    matchday=matchday,
                    snapshot_date=snapshot_date,
                    position=_to_int(row["position"]),
                    played=_to_int(row["played"]),
                    won=_to_int(row["won"]),
                    drawn=_to_int(row["drawn"]),
                    lost=_to_int(row["lost"]),
                    goals_for=goals_for,
                    goals_against=goals_against,
                    goal_difference=_to_int(row.get("goal_difference"), goals_for - goals_against),
                    points=_to_int(row["points"]),
                )
            )
            result.created += 1
        except Exception as exc:
            result.errors.append(ImportErrorDetail(row=row_number, message=str(exc)))
    result.processed = result.created + result.updated + result.skipped + len(result.errors)
    db.commit()
    return result


def import_results_csv(db: Session, raw_csv: bytes) -> ImportResult:
    result = ImportResult(import_type="results_csv")
    for row_number, row in _iter_rows(raw_csv):
        try:
            competition = _get_or_create_competition(db, row["competition"], row.get("country"), row.get("competition_type"))
            season = _get_or_create_season(db, competition, row["season"])
            home_team = _get_or_create_team(db, row["home_team"], row.get("country"))
            away_team = _get_or_create_team(db, row["away_team"], row.get("country"))
            stadium = _get_or_create_stadium(db, row.get("stadium"), row.get("city"), row.get("country"))
            source = row.get("source") or "csv"
            external_id = row.get("external_id") or _match_external_id(row)
            existing = _get_match_by_source(db, source, external_id)
            if existing:
                _update_match_score(existing, row)
                result.updated += 1
                continue
            db.add(
                Match(
                    competition_id=competition.id,
                    season_id=season.id,
                    matchday=_to_optional_int(row.get("matchday")),
                    match_date=_parse_datetime(row["match_date"]),
                    home_team_id=home_team.id,
                    away_team_id=away_team.id,
                    stadium_id=stadium.id if stadium else None,
                    home_score=_to_optional_int(row.get("home_score")),
                    away_score=_to_optional_int(row.get("away_score")),
                    status=row.get("status") or "finished",
                    is_friendly=_to_bool(row.get("is_friendly")),
                    source=source,
                    external_id=external_id,
                )
            )
            result.created += 1
        except Exception as exc:
            result.errors.append(ImportErrorDetail(row=row_number, message=str(exc)))
    result.processed = result.created + result.updated + result.skipped + len(result.errors)
    db.commit()
    return result


def import_player_stats_csv(db: Session, raw_csv: bytes) -> ImportResult:
    result = ImportResult(import_type="player_stats_csv")
    for row_number, row in _iter_rows(raw_csv):
        try:
            competition = _get_or_create_competition(db, row["competition"], row.get("country"), row.get("competition_type"))
            season = _get_or_create_season(db, competition, row["season"])
            team = _get_or_create_team(db, row["team"], row.get("country"))
            opponent = _get_or_create_team(db, row["opponent_team"], row.get("country"))
            stadium = _get_or_create_stadium(db, row.get("stadium"), row.get("city"), row.get("country"))
            player = _get_or_create_player(
                db,
                full_name=row["player_full_name"],
                date_of_birth=_parse_optional_date(row.get("date_of_birth")),
                nationality=row.get("nationality"),
                primary_position=row.get("primary_position"),
                external_id=row.get("player_external_id"),
            )
            match = _get_or_create_stats_match(db, row, competition, season, team, opponent, stadium)
            source = row.get("source") or "csv"
            existing = db.scalar(
                select(PlayerMatchStats).where(
                    PlayerMatchStats.player_id == player.id,
                    PlayerMatchStats.match_id == match.id,
                    PlayerMatchStats.source == source,
                )
            )
            if existing:
                result.skipped += 1
                continue
            db.add(
                PlayerMatchStats(
                    player_id=player.id,
                    match_id=match.id,
                    team_id=team.id,
                    opponent_team_id=opponent.id,
                    stadium_id=stadium.id if stadium else None,
                    competition_id=competition.id,
                    season_id=season.id,
                    started=_to_bool(row.get("started")),
                    minutes_played=_to_int(row["minutes_played"]),
                    position_played=row.get("position_played") or row.get("primary_position"),
                    goals=_to_int(row.get("goals"), 0),
                    assists=_to_int(row.get("assists"), 0),
                    shots=_to_optional_int(row.get("shots")),
                    shots_on_target=_to_optional_int(row.get("shots_on_target")),
                    key_passes=_to_optional_int(row.get("key_passes")),
                    expected_goals=_to_optional_decimal(row.get("expected_goals")),
                    expected_assists=_to_optional_decimal(row.get("expected_assists")),
                    rating=_to_optional_decimal(row.get("rating")),
                    yellow_cards=_to_int(row.get("yellow_cards"), 0),
                    red_cards=_to_int(row.get("red_cards"), 0),
                    was_home_team=_to_bool(row.get("was_home_team")),
                    captured_at=_parse_datetime(row.get("captured_at") or datetime.now(UTC).isoformat()),
                    source=source,
                )
            )
            result.created += 1
        except Exception as exc:
            result.errors.append(ImportErrorDetail(row=row_number, message=str(exc)))
    result.processed = result.created + result.updated + result.skipped + len(result.errors)
    db.commit()
    return result


def import_goal_timing_csv(db: Session, raw_csv: bytes) -> ImportResult:
    result = ImportResult(import_type="goal_timing_csv")
    for row_number, row in _iter_rows(raw_csv):
        try:
            competition = _get_or_create_competition(db, row["competition"], row.get("country"), row.get("competition_type"))
            season = _get_or_create_season(db, competition, row["season"])
            team = _get_or_create_team(db, row["team"], row.get("country"))
            calculated_at = _parse_datetime(row.get("calculated_at") or datetime.now(UTC).isoformat())
            interval_start = _to_optional_int(row.get("interval_start"))
            interval_end = _to_optional_int(row.get("interval_end"))
            venue_type = row.get("venue_type") or "all"
            existing = db.scalar(
                select(TeamGoalTiming).where(
                    TeamGoalTiming.team_id == team.id,
                    TeamGoalTiming.competition_id == competition.id,
                    TeamGoalTiming.season_id == season.id,
                    TeamGoalTiming.venue_type == venue_type,
                    TeamGoalTiming.interval_start == interval_start,
                    TeamGoalTiming.interval_end == interval_end,
                    TeamGoalTiming.calculated_at == calculated_at,
                )
            )
            if existing:
                result.skipped += 1
                continue
            db.add(
                TeamGoalTiming(
                    team_id=team.id,
                    competition_id=competition.id,
                    season_id=season.id,
                    venue_type=venue_type,
                    interval_start=interval_start,
                    interval_end=interval_end,
                    goals_scored=_to_int(row.get("goals_scored"), 0),
                    goals_conceded=_to_int(row.get("goals_conceded"), 0),
                    matches_played=_to_int(row.get("matches_played"), 0),
                    percentage_scored=_to_optional_decimal(row.get("percentage_scored")),
                    percentage_conceded=_to_optional_decimal(row.get("percentage_conceded")),
                    calculated_at=calculated_at,
                )
            )
            result.created += 1
        except Exception as exc:
            result.errors.append(ImportErrorDetail(row=row_number, message=str(exc)))
    result.processed = result.created + result.updated + result.skipped + len(result.errors)
    db.commit()
    return result


def import_goal_moments_csv(db: Session, raw_csv: bytes) -> ImportResult:
    result = ImportResult(import_type="goal_moments_csv")
    calculated_at = datetime.now(UTC)
    aggregates: dict[tuple[int, int, int, str, int, int], dict[str, int | set[int]]] = {}

    for row_number, row in _iter_rows(raw_csv):
        try:
            match = _get_match_by_source(db, row.get("match_source") or "csv", row["match_external_id"])
            if not match:
                raise ValueError("match not found for goal moment")
            scoring_team = _team_in_match(db, match, row["team"])
            if not scoring_team:
                raise ValueError("team is not part of the match")
            conceding_team_id = match.away_team_id if scoring_team.id == match.home_team_id else match.home_team_id
            minute = _to_int(row["minute"])
            interval_start, interval_end = _goal_moment_interval(minute, row.get("period"))
            scorer_venue = "home" if scoring_team.id == match.home_team_id else "away"
            conceder_venue = "home" if conceding_team_id == match.home_team_id else "away"
            existing_moment = db.scalar(
                select(GoalMoment).where(
                    GoalMoment.match_id == match.id,
                    GoalMoment.scoring_team_id == scoring_team.id,
                    GoalMoment.minute == minute,
                    GoalMoment.period == (row.get("period") or None),
                )
            )
            if not existing_moment:
                db.add(
                    GoalMoment(
                        match_id=match.id,
                        scoring_team_id=scoring_team.id,
                        conceding_team_id=conceding_team_id,
                        minute=minute,
                        period=row.get("period") or None,
                        interval_start=interval_start,
                        interval_end=interval_end,
                        source=row.get("match_source") or "csv",
                        captured_at=calculated_at,
                    )
                )

            scored_key = (scoring_team.id, match.competition_id, match.season_id, scorer_venue, interval_start, interval_end)
            conceded_key = (conceding_team_id, match.competition_id, match.season_id, conceder_venue, interval_start, interval_end)
            _accumulate_goal_moment(aggregates, scored_key, match.id, "goals_scored")
            _accumulate_goal_moment(aggregates, conceded_key, match.id, "goals_conceded")
            result.created += 1
        except Exception as exc:
            result.errors.append(ImportErrorDetail(row=row_number, message=str(exc)))

    for (team_id, competition_id, season_id, venue_type, interval_start, interval_end), values in aggregates.items():
        matches_played = _team_matches_played(db, team_id, competition_id, season_id, venue_type)
        goals_scored = int(values["goals_scored"])
        goals_conceded = int(values["goals_conceded"])
        db.add(
            TeamGoalTiming(
                team_id=team_id,
                competition_id=competition_id,
                season_id=season_id,
                venue_type=venue_type,
                interval_start=interval_start,
                interval_end=interval_end,
                goals_scored=goals_scored,
                goals_conceded=goals_conceded,
                matches_played=matches_played,
                percentage_scored=_percentage(goals_scored, goals_scored + goals_conceded),
                percentage_conceded=_percentage(goals_conceded, goals_scored + goals_conceded),
                calculated_at=calculated_at,
            )
        )

    result.processed = result.created + result.updated + result.skipped + len(result.errors)
    db.commit()
    return result


def import_forebet_csv(db: Session, raw_csv: bytes) -> ImportResult:
    result = ImportResult(import_type="forebet_csv")
    for row_number, row in _iter_rows(raw_csv):
        try:
            match = _get_match_by_source(db, row.get("match_source") or "csv", row["match_external_id"])
            if not match:
                raise ValueError("match not found for Forebet prediction")
            captured_at = _parse_datetime(row["captured_at"])
            existing = db.scalar(
                select(ForebetPrediction).where(
                    ForebetPrediction.match_id == match.id,
                    ForebetPrediction.captured_at == captured_at,
                )
            )
            if existing:
                result.skipped += 1
                continue
            predicted_home_score, predicted_away_score = _parse_score(row.get("predicted_score"))
            db.add(
                ForebetPrediction(
                    match_id=match.id,
                    captured_at=captured_at,
                    home_probability=_to_optional_decimal(row.get("home_probability")),
                    draw_probability=_to_optional_decimal(row.get("draw_probability")),
                    away_probability=_to_optional_decimal(row.get("away_probability")),
                    prediction=row.get("prediction"),
                    predicted_home_score=_to_optional_int(row.get("predicted_home_score"), predicted_home_score),
                    predicted_away_score=_to_optional_int(row.get("predicted_away_score"), predicted_away_score),
                    expected_goals=_to_optional_decimal(row.get("expected_goals")),
                    over_under_prediction=row.get("over_under_prediction"),
                    both_teams_score_prediction=row.get("both_teams_score_prediction"),
                    source_url=row.get("source_url"),
                )
            )
            result.created += 1
        except Exception as exc:
            result.errors.append(ImportErrorDetail(row=row_number, message=str(exc)))
    result.processed = result.created + result.updated + result.skipped + len(result.errors)
    db.commit()
    return result


def _iter_rows(raw_csv: bytes) -> list[tuple[int, dict[str, str]]]:
    text = raw_csv.decode("utf-8-sig")
    reader = csv.DictReader(StringIO(text))
    if not reader.fieldnames:
        raise ValueError("CSV file has no header")
    rows = []
    for index, row in enumerate(reader, start=2):
        normalized = {(key or "").strip(): (value or "").strip() for key, value in row.items()}
        rows.append((index, normalized))
    return rows


def _get_or_create_competition(
    db: Session,
    name: str,
    country: str | None = None,
    competition_type: str | None = None,
) -> Competition:
    normalized = normalize_name(name)
    competition = db.scalar(select(Competition).where(Competition.normalized_name == normalized))
    if competition:
        if competition_type and not competition.competition_type:
            competition.competition_type = _normalize_competition_type(competition_type)
        return competition
    competition = Competition(
        name=name.strip(),
        normalized_name=normalized,
        country=country or None,
        competition_type=_normalize_competition_type(competition_type) if competition_type else _infer_competition_type(name),
        source="csv",
    )
    db.add(competition)
    db.flush()
    return competition


def _get_or_create_season(db: Session, competition: Competition, name: str) -> Season:
    season = db.scalar(select(Season).where(Season.competition_id == competition.id, Season.name == name.strip()))
    if season:
        return season
    season = Season(competition_id=competition.id, name=name.strip(), is_current=False)
    db.add(season)
    db.flush()
    return season


def _get_or_create_team(db: Session, name: str, country: str | None = None) -> Team:
    normalized = normalize_name(name)
    team = db.scalar(select(Team).where(Team.normalized_name == normalized, Team.country == (country or None)))
    if team:
        return team
    team = Team(name=name.strip(), normalized_name=normalized, country=country or None)
    db.add(team)
    db.flush()
    return team


def _get_or_create_stadium(db: Session, name: str | None, city: str | None, country: str | None) -> Stadium | None:
    if not name:
        return None
    normalized = normalize_name(name)
    stadium = db.scalar(select(Stadium).where(Stadium.normalized_name == normalized, Stadium.country == (country or None)))
    if stadium:
        return stadium
    stadium = Stadium(name=name.strip(), normalized_name=normalized, city=city or None, country=country or None)
    db.add(stadium)
    db.flush()
    return stadium


def _get_or_create_player(
    db: Session,
    full_name: str,
    date_of_birth: date | None,
    nationality: str | None,
    primary_position: str | None,
    external_id: str | None,
) -> Player:
    if external_id:
        player = db.scalar(select(Player).where(Player.external_id == external_id))
        if player:
            return player
    normalized = normalize_name(full_name)
    query = select(Player).where(
        Player.normalized_name == normalized,
        Player.date_of_birth == date_of_birth,
        Player.nationality == (nationality or None),
    )
    player = db.scalar(query)
    if player:
        return player
    player = Player(
        full_name=full_name.strip(),
        normalized_name=normalized,
        date_of_birth=date_of_birth,
        nationality=nationality or None,
        primary_position=primary_position or None,
        external_id=external_id or None,
    )
    db.add(player)
    db.flush()
    return player


def _get_or_create_stats_match(
    db: Session,
    row: dict[str, str],
    competition: Competition,
    season: Season,
    team: Team,
    opponent: Team,
    stadium: Stadium | None,
) -> Match:
    source = row.get("match_source") or row.get("source") or "csv"
    external_id = row.get("match_external_id") or _match_external_id(row)
    match = _get_match_by_source(db, source, external_id)
    if match:
        return match
    match = Match(
        competition_id=competition.id,
        season_id=season.id,
        matchday=_to_optional_int(row.get("matchday")),
        match_date=_parse_datetime(row["match_date"]),
        home_team_id=team.id if _to_bool(row.get("was_home_team")) else opponent.id,
        away_team_id=opponent.id if _to_bool(row.get("was_home_team")) else team.id,
        stadium_id=stadium.id if stadium else None,
        home_score=_to_optional_int(row.get("home_score")),
        away_score=_to_optional_int(row.get("away_score")),
        status=row.get("status") or "finished",
        is_friendly=_to_bool(row.get("is_friendly")),
        source=source,
        external_id=external_id,
    )
    db.add(match)
    db.flush()
    return match


def _get_match_by_source(db: Session, source: str, external_id: str) -> Match | None:
    return db.scalar(select(Match).where(Match.source == source, Match.external_id == external_id))


def _team_in_match(db: Session, match: Match, team_name: str) -> Team | None:
    normalized = normalize_name(team_name)
    if normalize_name(match.home_team.name) == normalized:
        return match.home_team
    if normalize_name(match.away_team.name) == normalized:
        return match.away_team
    return db.scalar(
        select(Team).where(
            Team.id.in_([match.home_team_id, match.away_team_id]),
            Team.normalized_name == normalized,
        )
    )


def _goal_moment_interval(minute: int, period: str | None = None) -> tuple[int, int]:
    normalized_period = normalize_name(period or "")
    if "first" in normalized_period or "primera" in normalized_period or "1" == normalized_period:
        if minute <= 15:
            return 1, 15
        if minute <= 30:
            return 15, 30
        return 30, 45
    if "second" in normalized_period or "segunda" in normalized_period or "2" == normalized_period:
        if minute <= 15:
            return 46, 60
        if minute <= 30:
            return 60, 75
        if minute <= 45:
            return 75, 90
        if minute <= 60:
            return 46, 60
        if minute <= 75:
            return 60, 75
        return 75, 90
    if minute <= 15:
        return 1, 15
    if minute <= 30:
        return 15, 30
    if minute <= 45:
        return 30, 45
    if minute <= 60:
        return 46, 60
    if minute <= 75:
        return 60, 75
    return 75, 90


def _accumulate_goal_moment(
    aggregates: dict[tuple[int, int, int, str, int, int], dict[str, int | set[int]]],
    key: tuple[int, int, int, str, int, int],
    match_id: int,
    field: str,
) -> None:
    item = aggregates.setdefault(key, {"goals_scored": 0, "goals_conceded": 0, "match_ids": set()})
    item[field] = int(item[field]) + 1
    match_ids = item["match_ids"]
    if isinstance(match_ids, set):
        match_ids.add(match_id)


def _team_matches_played(db: Session, team_id: int, competition_id: int, season_id: int, venue_type: str) -> int:
    query = select(Match).where(Match.competition_id == competition_id, Match.season_id == season_id)
    if venue_type == "home":
        query = query.where(Match.home_team_id == team_id)
    elif venue_type == "away":
        query = query.where(Match.away_team_id == team_id)
    else:
        query = query.where((Match.home_team_id == team_id) | (Match.away_team_id == team_id))
    return len(list(db.scalars(query).all()))


def _percentage(value: int, total: int) -> Decimal | None:
    if total <= 0:
        return None
    return Decimal(str(round(value * 100 / total, 2)))


def _update_match_score(match: Match, row: dict[str, str]) -> None:
    match.matchday = _to_optional_int(row.get("matchday"), match.matchday)
    match.home_score = _to_optional_int(row.get("home_score"))
    match.away_score = _to_optional_int(row.get("away_score"))
    match.status = row.get("status") or match.status
    if row.get("is_friendly") not in (None, ""):
        match.is_friendly = _to_bool(row.get("is_friendly"))


def _normalize_competition_type(value: str) -> str:
    normalized = normalize_name(value).replace(" ", "_")
    aliases = {
        "liga": "domestic_league",
        "league": "domestic_league",
        "domestic": "domestic_league",
        "domestic_league": "domestic_league",
        "copa": "domestic_cup",
        "cup": "domestic_cup",
        "domestic_cup": "domestic_cup",
        "continental": "continental",
        "europe": "continental",
        "amistoso": "friendly",
        "friendly": "friendly",
    }
    return aliases.get(normalized, normalized or "unknown")


def _infer_competition_type(name: str) -> str:
    normalized = normalize_name(name)
    if any(token in normalized for token in ("friendly", "amistoso")):
        return "friendly"
    if any(token in normalized for token in ("champions", "europa", "libertadores", "continental")):
        return "continental"
    if any(token in normalized for token in ("cup", "copa")):
        return "domestic_cup"
    return "domestic_league"


def _match_external_id(row: dict[str, str]) -> str:
    parts: list[Any] = [
        row.get("competition"),
        row.get("season"),
        row.get("match_date"),
        row.get("home_team") or row.get("team"),
        row.get("away_team") or row.get("opponent_team"),
    ]
    return normalize_name("|".join(str(part) for part in parts if part))


def _parse_datetime(value: str) -> datetime:
    if not value:
        raise ValueError("datetime value is required")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _parse_optional_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)


def _parse_score(value: str | None) -> tuple[int | None, int | None]:
    if not value or "-" not in value:
        return None, None
    home, away = value.split("-", 1)
    return _to_optional_int(home), _to_optional_int(away)


def _to_int(value: str | int | None, default: int | None = None) -> int:
    if value in (None, ""):
        if default is None:
            raise ValueError("integer value is required")
        return default
    return int(value)


def _to_optional_int(value: str | int | None, default: int | None = None) -> int | None:
    if value in (None, ""):
        return default
    return int(value)


def _to_optional_decimal(value: str | int | float | Decimal | None) -> Decimal | None:
    if value in (None, ""):
        return None
    return Decimal(str(value).replace(",", "."))


def _to_bool(value: str | bool | None) -> bool:
    if isinstance(value, bool):
        return value
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "si", "home", "local", "started"}
