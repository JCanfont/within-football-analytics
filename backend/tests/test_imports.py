from collections.abc import Generator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import ForebetPrediction, Match, PlayerMatchStats, StandingsSnapshot, Team, TeamGoalTiming


def _client_with_db() -> tuple[TestClient, sessionmaker[Session]]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), testing_session


def test_import_standings_csv_skips_duplicate_snapshot() -> None:
    client, testing_session = _client_with_db()
    csv_content = (
        "competition,season,country,team,matchday,snapshot_date,position,played,won,drawn,lost,goals_for,goals_against,points\n"
        "LaLiga,2026/2027,Spain,Getafe,1,2026-08-14T12:00:00+00:00,10,0,0,0,0,0,0,0\n"
    )

    first = client.post("/api/import/standings-csv", files={"file": ("standings.csv", csv_content, "text/csv")})
    second = client.post("/api/import/standings-csv", files={"file": ("standings.csv", csv_content, "text/csv")})

    assert first.status_code == 200
    assert first.json()["created"] == 1
    assert second.json()["skipped"] == 1
    with testing_session() as db:
        assert db.query(StandingsSnapshot).count() == 1
    app.dependency_overrides.clear()


def test_import_results_csv_updates_existing_match() -> None:
    client, testing_session = _client_with_db()
    csv_initial = (
        "competition,season,country,competition_type,matchday,match_date,home_team,away_team,stadium,home_score,away_score,status,is_friendly,source,external_id\n"
        "LaLiga,2026/2027,Spain,domestic_league,1,2026-08-15T19:30:00+00:00,Getafe,Osasuna,Coliseum,1,0,finished,false,csv,match-1\n"
    )
    csv_update = csv_initial.replace(",1,0,finished,", ",1,1,finished,")

    first = client.post("/api/import/results-csv", files={"file": ("results.csv", csv_initial, "text/csv")})
    second = client.post("/api/import/results-csv", files={"file": ("results.csv", csv_update, "text/csv")})

    assert first.json()["created"] == 1
    assert second.json()["updated"] == 1
    with testing_session() as db:
        match = db.query(Match).one()
        assert match.home_score == 1
        assert match.away_score == 1
        assert match.is_friendly is False
        assert match.competition.competition_type == "domestic_league"
    app.dependency_overrides.clear()


def test_import_player_stats_and_goal_timing_csv() -> None:
    client, testing_session = _client_with_db()
    player_stats_csv = (
        "competition,season,country,matchday,match_date,team,opponent_team,was_home_team,stadium,player_full_name,"
        "date_of_birth,nationality,primary_position,minutes_played,started,goals,assists,captured_at,source,match_external_id\n"
        "LaLiga,2026/2027,Spain,1,2026-08-15T19:30:00+00:00,Getafe,Osasuna,true,Coliseum,Borja Mayoral,"
        "1997-04-05,Spain,forward,90,true,1,0,2026-08-15T22:00:00+00:00,csv,match-player-1\n"
    )
    goal_timing_csv = (
        "competition,season,country,team,venue_type,interval_start,interval_end,goals_scored,goals_conceded,"
        "matches_played,percentage_scored,percentage_conceded,calculated_at\n"
        "LaLiga,2026/2027,Spain,Getafe,home,76,90,4,6,10,25,35,2026-08-16T10:00:00+00:00\n"
    )

    stats_response = client.post(
        "/api/import/player-stats-csv",
        files={"file": ("player_stats.csv", player_stats_csv, "text/csv")},
    )
    timing_response = client.post(
        "/api/import/goal-timing-csv",
        files={"file": ("goal_timing.csv", goal_timing_csv, "text/csv")},
    )

    assert stats_response.json()["created"] == 1
    assert timing_response.json()["created"] == 1
    with testing_session() as db:
        assert db.query(PlayerMatchStats).count() == 1
        assert db.query(TeamGoalTiming).count() == 1
    app.dependency_overrides.clear()


def test_import_goal_moments_csv_builds_interval_timing() -> None:
    client, testing_session = _client_with_db()
    results_csv = (
        "competition,season,country,competition_type,matchday,match_date,home_team,away_team,home_score,away_score,status,source,external_id\n"
        "LaLiga,2026/2027,Spain,domestic_league,1,2026-08-15T19:30:00+00:00,Getafe,Osasuna,2,1,finished,csv,match-goals-1\n"
        "LaLiga,2026/2027,Spain,domestic_league,2,2026-08-22T19:30:00+00:00,Getafe,Betis,1,0,finished,csv,match-goals-2\n"
    )
    goal_moments_csv = (
        "match_source,match_external_id,team,minute,period\n"
        "csv,match-goals-1,Getafe,12,first\n"
        "csv,match-goals-1,Osasuna,45,first\n"
        "csv,match-goals-1,Getafe,77,second\n"
        "csv,match-goals-1,Osasuna,4,segunda\n"
        "csv,match-goals-2,Getafe,62,second\n"
    )

    client.post("/api/import/results-csv", files={"file": ("results.csv", results_csv, "text/csv")})
    response = client.post("/api/import/goal-moments-csv", files={"file": ("goal_moments.csv", goal_moments_csv, "text/csv")})

    assert response.status_code == 200
    assert response.json()["created"] == 5
    with testing_session() as db:
        teams = {team.name: team.id for team in db.query(Team).all()}
        rows = {(row.team_id, row.interval_start, row.interval_end): row for row in db.query(TeamGoalTiming).all()}
        assert rows[(teams["Getafe"], 1, 15)].goals_scored == 1
        assert rows[(teams["Getafe"], 75, 90)].goals_scored == 1
        assert rows[(teams["Getafe"], 60, 75)].goals_scored == 1
        assert rows[(teams["Osasuna"], 30, 45)].goals_scored == 1
        assert rows[(teams["Osasuna"], 46, 60)].goals_scored == 1
        assert rows[(teams["Osasuna"], 75, 90)].goals_conceded == 1
    app.dependency_overrides.clear()


def test_import_forebet_csv_keeps_capture_history() -> None:
    client, testing_session = _client_with_db()
    results_csv = (
        "competition,season,country,matchday,match_date,home_team,away_team,status,source,external_id\n"
        "LaLiga,2026/2027,Spain,1,2026-08-15T19:30:00+00:00,Getafe,Osasuna,scheduled,csv,match-forebet-1\n"
    )
    forebet_csv = (
        "match_source,match_external_id,captured_at,home_probability,draw_probability,away_probability,prediction,"
        "predicted_score,expected_goals,over_under_prediction,both_teams_score_prediction,source_url\n"
        "csv,match-forebet-1,2026-08-14T09:00:00+00:00,38.5,31.0,30.5,1X,1-1,2.1,under_2_5,yes,https://www.forebet.com/\n"
        "csv,match-forebet-1,2026-08-14T18:00:00+00:00,39.0,30.0,31.0,1X,1-1,2.0,under_2_5,yes,https://www.forebet.com/\n"
    )

    client.post("/api/import/results-csv", files={"file": ("results.csv", results_csv, "text/csv")})
    response = client.post("/api/import/forebet", files={"file": ("forebet.csv", forebet_csv, "text/csv")})

    assert response.status_code == 200
    assert response.json()["created"] == 2
    with testing_session() as db:
        assert db.query(ForebetPrediction).count() == 2
    app.dependency_overrides.clear()
