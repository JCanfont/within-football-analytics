from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Competition, GoalMoment, Match, Player, PlayerMatchStats, Season, StandingsSnapshot, Team
from app.services.statistical_questions import answer_statistical_question
from app.utils.normalization import normalize_name


def _session() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _seed_basic(db: Session) -> dict:
    competition = Competition(
        name="LaLiga",
        normalized_name=normalize_name("LaLiga"),
        country="Spain",
        competition_type="domestic_league",
        source="test",
        external_id="laliga",
    )
    other = Competition(
        name="Serie A",
        normalized_name=normalize_name("Serie A"),
        country="Italy",
        competition_type="domestic_league",
        source="test",
        external_id="seriea",
    )
    db.add_all([competition, other])
    db.flush()
    season = Season(competition_id=competition.id, name="2026/2027", is_current=True)
    season_prev = Season(competition_id=competition.id, name="2025/2026", is_current=False)
    season_other = Season(competition_id=other.id, name="2026/2027", is_current=True)
    db.add_all([season, season_prev, season_other])
    db.flush()
    getafe = Team(name="Getafe", normalized_name=normalize_name("Getafe"), country="Spain")
    osasuna = Team(name="Osasuna", normalized_name=normalize_name("Osasuna"), country="Spain")
    milan = Team(name="Milan", normalized_name=normalize_name("Milan"), country="Italy")
    inter = Team(name="Inter", normalized_name=normalize_name("Inter"), country="Italy")
    db.add_all([getafe, osasuna, milan, inter])
    db.flush()

    now = datetime(2026, 8, 15, 19, 30, tzinfo=UTC)
    m1 = Match(
        competition_id=competition.id,
        season_id=season.id,
        matchday=1,
        match_date=now,
        home_team_id=getafe.id,
        away_team_id=osasuna.id,
        home_score=0,
        away_score=0,
        status="finished",
        source="test",
        external_id="m1",
    )
    m2 = Match(
        competition_id=competition.id,
        season_id=season.id,
        matchday=2,
        match_date=now + timedelta(days=7),
        home_team_id=osasuna.id,
        away_team_id=getafe.id,
        home_score=1,
        away_score=0,
        status="finished",
        source="test",
        external_id="m2",
    )
    m3 = Match(
        competition_id=other.id,
        season_id=season_other.id,
        matchday=1,
        match_date=now,
        home_team_id=milan.id,
        away_team_id=inter.id,
        home_score=3,
        away_score=2,
        status="finished",
        source="test",
        external_id="m3",
    )
    db.add_all([m1, m2, m3])
    db.flush()
    return {
        "competition": competition,
        "other": other,
        "season": season,
        "season_prev": season_prev,
        "getafe": getafe,
        "osasuna": osasuna,
        "milan": milan,
        "inter": inter,
        "m1": m1,
        "m2": m2,
        "m3": m3,
    }


def test_league_goals_per_match_ranks_competitions() -> None:
    db = _session()
    _seed_basic(db)
    db.commit()

    result = answer_statistical_question(db, "Cuales son las ligas que mas y menos goles por partido marcan?")

    assert result["question_type"] == "league_goals_per_match"
    assert result["data_status"] == "ok"
    assert result["rankings"][0]["label"] == "Serie A"
    assert result["rankings"][-1]["label"] == "LaLiga"
    db.close()


def test_team_shots_and_shots_per_goal() -> None:
    db = _session()
    seeded = _seed_basic(db)
    player = Player(full_name="Borja Mayoral", normalized_name=normalize_name("Borja Mayoral"))
    db.add(player)
    db.flush()
    db.add_all(
        [
            PlayerMatchStats(
                player_id=player.id,
                match_id=seeded["m1"].id,
                team_id=seeded["getafe"].id,
                opponent_team_id=seeded["osasuna"].id,
                competition_id=seeded["competition"].id,
                season_id=seeded["season"].id,
                minutes_played=90,
                goals=0,
                shots_on_target=6,
                yellow_cards=1,
                red_cards=0,
                was_home_team=True,
                captured_at=datetime.now(UTC),
                source="test",
            ),
            PlayerMatchStats(
                player_id=player.id,
                match_id=seeded["m2"].id,
                team_id=seeded["osasuna"].id,
                opponent_team_id=seeded["getafe"].id,
                competition_id=seeded["competition"].id,
                season_id=seeded["season"].id,
                minutes_played=90,
                goals=1,
                shots_on_target=2,
                yellow_cards=0,
                red_cards=1,
                was_home_team=True,
                captured_at=datetime.now(UTC),
                source="test",
            ),
        ]
    )
    db.commit()

    shots = answer_statistical_question(db, "En LaLiga, que equipos disparan mas y menos a puerta?")
    ratio = answer_statistical_question(db, "Que equipos necesitan mas disparos a puerta para marcar un gol?")
    cards = answer_statistical_question(db, "Que liga es la mas y menos tarjetera?")
    red = answer_statistical_question(db, "Que porcentaje de partidos hay un gol despues de una tarjeta roja?")

    assert shots["question_type"] == "team_shots_on_target"
    assert shots["rankings"][0]["label"].startswith("Getafe")
    assert ratio["question_type"] == "shots_on_target_per_goal"
    assert cards["question_type"] == "league_cards"
    assert red["data_status"] == "partial"
    db.close()


def test_after_00_uses_goal_moments() -> None:
    db = _session()
    seeded = _seed_basic(db)
    db.add(
        GoalMoment(
            match_id=seeded["m2"].id,
            scoring_team_id=seeded["osasuna"].id,
            conceding_team_id=seeded["getafe"].id,
            minute=62,
            period="second",
            interval_start=60,
            interval_end=75,
            source="test",
            captured_at=datetime.now(UTC),
        )
    )
    db.commit()

    result = answer_statistical_question(
        db,
        "Si un partido acaba 0-0, que porcentaje el siguiente de esa competicion no tiene gol en la primera parte?",
    )

    assert result["question_type"] == "after_00_next_first_half"
    assert result["data_status"] == "ok"
    assert result["metrics"]["percentage"] == 100.0
    db.close()


def test_season_ratio_and_missing_templates() -> None:
    db = _session()
    seeded = _seed_basic(db)
    for season, points, goals in (
        (seeded["season"], 20, 18),
        (seeded["season_prev"], 10, 8),
    ):
        db.add(
            StandingsSnapshot(
                competition_id=seeded["competition"].id,
                season_id=season.id,
                team_id=seeded["getafe"].id,
                matchday=10,
                snapshot_date=datetime.now(UTC),
                position=1,
                played=10,
                won=5,
                drawn=5,
                lost=0,
                goals_for=goals,
                goals_against=5,
                goal_difference=goals - 5,
                points=points,
            )
        )
        db.add(
            StandingsSnapshot(
                competition_id=seeded["competition"].id,
                season_id=season.id,
                team_id=seeded["osasuna"].id,
                matchday=10,
                snapshot_date=datetime.now(UTC),
                position=2,
                played=10,
                won=2,
                drawn=2,
                lost=6,
                goals_for=6,
                goals_against=12,
                goal_difference=-6,
                points=8 if season.id == seeded["season"].id else 16,
            )
        )
    db.commit()

    ratio = answer_statistical_question(
        db,
        "Que equipos tienen mejor y peor ratio vs la temporada anterior en goles y puntos?",
    )
    live = answer_statistical_question(
        db,
        "En que partidos en vivo llegando al minuto 75 hay menos de 1 disparo a puerta?",
    )

    assert ratio["question_type"] == "season_over_season"
    assert ratio["metrics"]["current_season"] == "2026/2027"
    assert ratio["metrics"]["previous_season"] == "2025/2026"
    assert ratio["metrics"]["best_points_team"] == "Getafe"
    assert live["data_status"] == "missing_data"
    db.close()


def test_player_vs_team_ranking() -> None:
    db = _session()
    seeded = _seed_basic(db)
    player = Player(full_name="Borja Mayoral", normalized_name=normalize_name("Borja Mayoral"))
    db.add(player)
    db.flush()
    db.add(
        PlayerMatchStats(
            player_id=player.id,
            match_id=seeded["m1"].id,
            team_id=seeded["getafe"].id,
            opponent_team_id=seeded["osasuna"].id,
            competition_id=seeded["competition"].id,
            season_id=seeded["season"].id,
            minutes_played=90,
            goals=2,
            shots_on_target=3,
            was_home_team=True,
            captured_at=datetime.now(UTC),
            source="test",
        )
    )
    db.commit()

    result = answer_statistical_question(db, "Que jugadores se les da mejor contra Osasuna?")

    assert result["question_type"] == "player_vs_team"
    assert result["matched_team"] == "Osasuna"
    assert result["rankings"][0]["label"].startswith("Borja Mayoral")
    db.close()
