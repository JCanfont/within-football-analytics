from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Competition, Match, Season, Team
from app.services.csv_imports import import_match_incidents_csv, import_results_csv
from app.services.statistical_questions import answer_statistical_question
from app.utils.normalization import normalize_name


def _session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_results_csv_imports_shots_cards_odds_and_ht() -> None:
    db = _session()
    csv_payload = (
        "competition,season,country,competition_type,matchday,match_date,home_team,away_team,home_score,away_score,"
        "home_ht_score,away_ht_score,home_shots,away_shots,home_shots_on_target,away_shots_on_target,"
        "home_yellow_cards,away_yellow_cards,home_red_cards,away_red_cards,home_odds,draw_odds,away_odds,odds_source,"
        "status,is_friendly,source,external_id\n"
        "LaLiga,2025/2026,Spain,domestic_league,1,2026-08-15T19:30:00+00:00,Getafe,Osasuna,2,0,"
        "1,0,12,4,5,1,2,1,0,0,1.40,4.20,8.50,football-data-avg,"
        "finished,false,football-data,fd-1\n"
        "LaLiga,2025/2026,Spain,domestic_league,2,2026-08-22T19:30:00+00:00,Osasuna,Getafe,0,0,"
        "0,0,6,7,2,2,3,2,1,0,2.10,3.20,3.40,football-data-avg,"
        "finished,false,football-data,fd-2\n"
    )
    result = import_results_csv(db, csv_payload.encode("utf-8"))
    assert result.created == 2

    match = db.scalar(select(Match).where(Match.external_id == "fd-1"))
    assert match is not None
    assert match.home_shots_on_target == 5
    assert match.home_ht_score == 1
    assert match.home_odds == Decimal("1.40")
    assert match.odds_source == "football-data-avg"

    shots = answer_statistical_question(db, "En LaLiga, que equipos disparan mas y menos a puerta?")
    assert shots["data_status"] == "ok"
    assert shots["rankings"][0]["label"].startswith("Getafe")

    odds = answer_statistical_question(
        db,
        "Que porcentaje de partidos con cuota inicial 1,50 o inferior acaban con mas de dos goles de diferencia a favor del favorito?",
    )
    assert odds["data_status"] == "ok"
    assert odds["metrics"]["favorites_le_150"] == 1
    assert odds["metrics"]["margin_plus_2"] == 1

    cards = answer_statistical_question(db, "Que liga es la mas y menos tarjetera?")
    assert cards["data_status"] == "ok"
    db.close()


def test_after_00_uses_half_time_scores() -> None:
    db = _session()
    competition = Competition(
        name="LaLiga",
        normalized_name=normalize_name("LaLiga"),
        country="Spain",
        competition_type="domestic_league",
        source="test",
        external_id="laliga",
    )
    db.add(competition)
    db.flush()
    season = Season(competition_id=competition.id, name="2025/2026", is_current=True)
    db.add(season)
    db.flush()
    home = Team(name="Getafe", normalized_name=normalize_name("Getafe"), country="Spain")
    away = Team(name="Osasuna", normalized_name=normalize_name("Osasuna"), country="Spain")
    db.add_all([home, away])
    db.flush()
    db.add_all(
        [
            Match(
                competition_id=competition.id,
                season_id=season.id,
                match_date=datetime(2026, 8, 1, 20, 0, tzinfo=UTC),
                home_team_id=home.id,
                away_team_id=away.id,
                home_score=0,
                away_score=0,
                status="finished",
                source="test",
                external_id="a",
            ),
            Match(
                competition_id=competition.id,
                season_id=season.id,
                match_date=datetime(2026, 8, 8, 20, 0, tzinfo=UTC),
                home_team_id=away.id,
                away_team_id=home.id,
                home_score=1,
                away_score=0,
                home_ht_score=0,
                away_ht_score=0,
                status="finished",
                source="test",
                external_id="b",
            ),
        ]
    )
    db.commit()

    result = answer_statistical_question(
        db,
        "Si un partido acaba 0-0, que porcentaje el siguiente de esa competicion no tiene gol en la primera parte?",
    )
    assert result["data_status"] == "ok"
    assert result["metrics"]["percentage"] == 100.0
    db.close()


def test_goal_after_red_uses_incidents() -> None:
    db = _session()
    csv_payload = (
        "competition,season,country,competition_type,matchday,match_date,home_team,away_team,home_score,away_score,"
        "status,is_friendly,source,external_id\n"
        "LaLiga,2025/2026,Spain,domestic_league,1,2026-08-15T19:30:00+00:00,Getafe,Osasuna,2,0,"
        "finished,false,csv,inc-1\n"
    )
    import_results_csv(db, csv_payload.encode("utf-8"))
    incidents = (
        "match_source,match_external_id,team,incident_type,minute,player_name\n"
        "csv,inc-1,Osasuna,red_card,20,Player A\n"
        "csv,inc-1,Getafe,goal,33,Player B\n"
    )
    imported = import_match_incidents_csv(db, incidents.encode("utf-8"))
    assert imported.created == 2

    result = answer_statistical_question(
        db,
        "Que porcentaje de partidos hay un gol despues de una tarjeta roja?",
    )
    assert result["data_status"] == "ok"
    assert result["metrics"]["percentage"] == 100.0
    db.close()
