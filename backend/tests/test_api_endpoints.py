from collections.abc import Generator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


def _client_with_seed_data() -> TestClient:
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
    client = TestClient(app)
    _seed(client)
    return client


def test_catalog_and_match_endpoints() -> None:
    client = _client_with_seed_data()

    matches = client.get("/api/matches?include_analytics=true")
    match_id = matches.json()[0]["id"]
    detail = client.get(f"/api/matches/{match_id}")

    assert matches.status_code == 200
    assert matches.json()[0]["home_team"] == "Getafe"
    assert matches.json()[0]["competition_type"] == "domestic_league"
    assert matches.json()[0]["closed_midtable_index"] is not None
    assert client.get("/api/competitions").json()[0]["name"] == "LaLiga"
    assert len(client.get("/api/teams").json()) == 4
    assert client.get("/api/stadiums").json()[0]["name"] == "Coliseum"
    assert detail.status_code == 200
    assert detail.json()["forebet_predictions"][0]["prediction"] == "1X"
    assert len(detail.json()["standings"]) == 2
    app.dependency_overrides.clear()


def test_match_analytics_endpoint_explains_balance_index() -> None:
    client = _client_with_seed_data()
    match_id = client.get("/api/matches").json()[0]["id"]

    response = client.get(f"/api/analytics/matches/{match_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["closed_midtable_index"] is not None
    assert "equilibrio del partido" in body["explanation"]
    assert "diferencia goleadora media por partido" in body["explanation"]
    assert "si sale negativa" in body["explanation"]
    assert body["inputs"]["teams_in_table"] == 4
    assert "home_recent_form" in body["inputs"]
    assert "away_recent_form" in body["inputs"]
    assert body["inputs"]["injury_data_status"] == "missing"
    assert body["inputs"]["closed_midtable_index_without_injuries"] == body["closed_midtable_index"]
    assert "favorito" in body["inputs"]["favorite_context"]
    assert body["inputs"]["score_range"]["is_predictable"] is False
    assert body["inputs"]["score_range"]["missing_matches"] == 3
    assert "Faltan 3 partidos para prediccion" in body["inputs"]["score_range"]["summary"]
    assert body["goal_parameter_profile"]["competition_type"] == "domestic_league"
    assert body["goal_parameter_profile"]["under_over_profile"] == "under_2_5"
    assert body["goal_parameter_profile"]["sample_size"] == 60
    assert body["goal_parameter_profile"]["late_goal_signal"] == "pocos goles en el tramo final"
    assert "solo hay uno" in body["three_season_summary"]["explanation"]
    assert body["three_season_summary"]["direct_matches"][0]["home_team"] == "Getafe"
    assert body["three_season_summary"]["direct_matches"][0]["away_team"] == "Osasuna"
    assert body["three_season_summary"]["direct_matches"][0]["home_score"] == 1
    assert body["three_season_summary"]["direct_matches"][0]["away_score"] == 1
    assert body["three_season_summary"]["goals_variance"] == 0
    assert body["three_season_summary"]["goals_standard_deviation"] == 0
    assert body["three_season_summary"]["under_25_matches"] == 1
    assert body["three_season_summary"]["over_25_matches"] == 0
    app.dependency_overrides.clear()


def test_match_analytics_uses_saved_weights() -> None:
    client = _client_with_seed_data()
    match_id = client.get("/api/matches").json()[0]["id"]
    baseline = client.get(f"/api/analytics/matches/{match_id}").json()["closed_midtable_index"]
    config = client.get("/api/config/statistical").json()["value"]
    config["closed_midtable_weights"] = {
        "centrality": 0,
        "classification_distance": 0,
        "goal_balance": 0,
        "goal_activity": 1,
        "reliability": 0,
        "form": 0,
        "venue": 0,
    }

    client.put("/api/config/statistical", json=config)
    updated = client.get(f"/api/analytics/matches/{match_id}").json()["closed_midtable_index"]

    assert updated != baseline
    app.dependency_overrides.clear()


def test_match_feature_snapshot_endpoint_builds_tensor_ready_vector() -> None:
    client = _client_with_seed_data()
    match_id = client.get("/api/matches").json()[0]["id"]

    response = client.get(f"/api/analytics/features/matches/{match_id}")
    rebuild = client.post("/api/analytics/features/rebuild?limit=1")

    assert response.status_code == 200
    body = response.json()
    assert body["match_id"] == match_id
    assert body["schema_version"] == "v1"
    assert body["tensor_key"].startswith("competition:")
    assert body["classification_gap"] == 1
    assert body["feature_vector"]["order"][0] == "competition_id"
    assert len(body["feature_vector"]["order"]) == len(body["feature_vector"]["values"])
    assert rebuild.status_code == 200
    assert rebuild.json()["created_or_updated"] == 1
    app.dependency_overrides.clear()


def test_statistical_question_endpoint_answers_under_over_streaks() -> None:
    client = _client_with_seed_data()

    response = client.post("/api/analytics/questions", json={"question": "Cuantos partidos seguidos lleva Getafe con under 2,5?"})

    assert response.status_code == 200
    body = response.json()
    assert body["matched_team"] == "Getafe"
    assert body["sample_size"] == 1
    assert body["under_25"]["current"] == 1
    assert body["under_25"]["maximum"] == 1
    assert body["over_25"]["current"] == 0
    assert body["recent_matches"][0]["signal"] == "under_2_5"
    app.dependency_overrides.clear()


def test_global_statistical_question_groups_streaks_by_team() -> None:
    client = _client_with_seed_data()
    results_csv = (
        "competition,season,country,competition_type,matchday,match_date,home_team,away_team,stadium,city,home_score,away_score,status,is_friendly,source,external_id\n"
        "LaLiga,2026/2027,Spain,domestic_league,2,2026-08-16T19:30:00+00:00,Getafe,Betis,Coliseum,Getafe,3,0,finished,false,csv,match-api-2\n"
        "LaLiga,2026/2027,Spain,domestic_league,2,2026-08-17T19:30:00+00:00,Osasuna,Valencia,El Sadar,Pamplona,3,1,finished,false,csv,match-api-3\n"
        "LaLiga,2026/2027,Spain,domestic_league,3,2026-08-18T19:30:00+00:00,Getafe,Valencia,Coliseum,Getafe,4,0,finished,false,csv,match-api-4\n"
        "LaLiga,2026/2027,Spain,domestic_league,3,2026-08-19T19:30:00+00:00,Betis,Osasuna,Benito Villamarin,Sevilla,0,0,finished,false,csv,match-api-5\n"
    )

    client.post("/api/import/results-csv", files={"file": ("extra-results.csv", results_csv, "text/csv")})
    response = client.post("/api/analytics/questions", json={"question": "Racha under y over 2,5 de todos los partidos"})

    assert response.status_code == 200
    body = response.json()
    assert body["scope"] == "todos los partidos cargados, agrupados por equipo"
    assert body["sample_size"] == 5
    assert "no mezclo partidos" in body["answer"]
    assert body["over_25"]["maximum"] == 2
    assert body["over_25"]["maximum_owner"] in {"Getafe", "Valencia"}
    app.dependency_overrides.clear()


def test_team_favorites_can_be_saved_listed_and_deleted() -> None:
    client = _client_with_seed_data()
    team_id = next(team["id"] for team in client.get("/api/teams").json() if team["name"] == "Getafe")

    created = client.post("/api/favorites", json={"entity_type": "team", "entity_id": team_id, "label": "Getafe"})
    favorites = client.get("/api/favorites?entity_type=team")
    deleted = client.delete(f"/api/favorites/{created.json()['id']}")

    assert created.status_code == 200
    assert created.json()["label"] == "Getafe"
    assert favorites.status_code == 200
    assert favorites.json()[0]["entity_id"] == team_id
    assert deleted.status_code == 200
    assert deleted.json()["label"] == "Getafe"
    assert client.get("/api/favorites?entity_type=team").json() == []
    app.dependency_overrides.clear()


def test_live_tracking_can_follow_all_or_selected_match() -> None:
    client = _client_with_seed_data()
    match_id = client.get("/api/matches").json()[0]["id"]

    initial = client.get("/api/live/tracking")
    global_update = client.put("/api/live/tracking/global", json={"enabled": True})
    match_update = client.put(f"/api/live/tracking/matches/{match_id}", json={"enabled": True})
    tuned = client.put(
        "/api/live/tracking",
        json={
            "follow_all_by_default": False,
            "tracked_match_ids": [match_id, match_id],
            "refresh_seconds": 30,
            "alert_level": "agresivo",
        },
    )

    assert initial.status_code == 200
    assert initial.json()["follow_all_by_default"] is False
    assert global_update.json()["follow_all_by_default"] is True
    assert match_update.json()["tracked_match_ids"] == [match_id]
    assert tuned.json() == {
        "follow_all_by_default": False,
        "tracked_match_ids": [match_id],
        "refresh_seconds": 600,
        "alert_level": "agresivo",
    }
    app.dependency_overrides.clear()


def test_generate_match_alerts_endpoint_creates_explainable_alerts() -> None:
    client = _client_with_seed_data()
    match_id = client.get("/api/matches").json()[0]["id"]

    generated = client.post(f"/api/alerts/generate/matches/{match_id}")
    listed = client.get("/api/alerts")

    assert generated.status_code == 200
    alert_types = {alert["alert_type"] for alert in generated.json()}
    assert "forebet_under_signal" in alert_types
    assert "jugador_con_buen_historial_en_el_estadio" in alert_types
    assert "equipo_encaja_especialmente_al_final" in alert_types
    assert all(alert["reason"] for alert in generated.json())
    assert len(listed.json()) >= 3
    app.dependency_overrides.clear()


def test_goal_timing_and_player_stadium_analytics_endpoints() -> None:
    client = _client_with_seed_data()
    teams = client.get("/api/teams").json()
    players = client.get("/api/players").json()
    stadiums = client.get("/api/stadiums").json()
    getafe_id = next(team["id"] for team in teams if team["name"] == "Getafe")
    player_id = players[0]["id"]
    stadium_id = stadiums[0]["id"]

    timing = client.get(f"/api/analytics/team/{getafe_id}/goal-timing")
    player_stadiums = client.get(f"/api/analytics/player/{player_id}/stadiums")
    stadium_players = client.get(f"/api/analytics/stadium/{stadium_id}/players")

    assert timing.status_code == 200
    assert {row["interval_start"] for row in timing.json()} == {0, 75}
    assert player_stadiums.status_code == 200
    assert player_stadiums.json()[0]["goals_per_90"] == 1.0
    assert stadium_players.status_code == 200
    assert stadium_players.json()["players"][0]["player"] == "Borja Mayoral"
    app.dependency_overrides.clear()


def _seed(client: TestClient) -> None:
    standings_csv = (
        "competition,season,country,team,matchday,snapshot_date,position,played,won,drawn,lost,goals_for,goals_against,points\n"
        "LaLiga,2026/2027,Spain,Getafe,1,2026-08-14T12:00:00+00:00,2,10,3,4,3,11,10,13\n"
        "LaLiga,2026/2027,Spain,Osasuna,1,2026-08-14T12:00:00+00:00,3,10,3,3,4,10,11,12\n"
        "LaLiga,2026/2027,Spain,Betis,1,2026-08-14T12:00:00+00:00,1,10,6,2,2,16,8,20\n"
        "LaLiga,2026/2027,Spain,Valencia,1,2026-08-14T12:00:00+00:00,4,10,2,2,6,7,14,8\n"
    )
    results_csv = (
        "competition,season,country,competition_type,matchday,match_date,home_team,away_team,stadium,city,home_score,away_score,status,is_friendly,source,external_id\n"
        "LaLiga,2026/2027,Spain,domestic_league,1,2026-08-15T19:30:00+00:00,Getafe,Osasuna,Coliseum,Getafe,1,1,finished,false,csv,match-api-1\n"
    )
    player_stats_csv = (
        "competition,season,country,matchday,match_date,team,opponent_team,was_home_team,stadium,city,player_full_name,"
        "date_of_birth,nationality,primary_position,minutes_played,started,goals,assists,captured_at,source,match_external_id\n"
        "LaLiga,2026/2027,Spain,1,2026-08-15T19:30:00+00:00,Getafe,Osasuna,true,Coliseum,Getafe,Borja Mayoral,"
        "1997-04-05,Spain,forward,90,true,1,0,2026-08-15T22:00:00+00:00,csv,match-api-1\n"
    )
    goal_timing_csv = (
        "competition,season,country,team,venue_type,interval_start,interval_end,goals_scored,goals_conceded,"
        "matches_played,percentage_scored,percentage_conceded,calculated_at\n"
        "LaLiga,2026/2027,Spain,Getafe,home,0,15,2,1,30,7,3,2026-08-16T10:00:00+00:00\n"
        "LaLiga,2026/2027,Spain,Getafe,home,75,90,4,6,30,25,35,2026-08-16T10:00:00+00:00\n"
        "LaLiga,2026/2027,Spain,Osasuna,away,0,15,1,2,30,3,7,2026-08-16T10:00:00+00:00\n"
        "LaLiga,2026/2027,Spain,Osasuna,away,75,90,3,5,30,10,17,2026-08-16T10:00:00+00:00\n"
    )
    forebet_csv = (
        "match_source,match_external_id,captured_at,home_probability,draw_probability,away_probability,prediction,"
        "predicted_score,expected_goals,over_under_prediction,both_teams_score_prediction,source_url\n"
        "csv,match-api-1,2026-08-14T09:00:00+00:00,38.5,31.0,30.5,1X,1-1,2.1,under_2_5,yes,https://www.forebet.com/\n"
    )

    client.post("/api/import/standings-csv", files={"file": ("standings.csv", standings_csv, "text/csv")})
    client.post("/api/import/results-csv", files={"file": ("results.csv", results_csv, "text/csv")})
    client.post("/api/import/player-stats-csv", files={"file": ("player_stats.csv", player_stats_csv, "text/csv")})
    client.post("/api/import/goal-timing-csv", files={"file": ("goal_timing.csv", goal_timing_csv, "text/csv")})
    client.post("/api/import/forebet", files={"file": ("forebet.csv", forebet_csv, "text/csv")})
