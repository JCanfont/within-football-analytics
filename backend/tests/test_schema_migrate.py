from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Competition, Match, Season, Team
from app.services.schema_migrate import ensure_schema
from app.utils.normalization import normalize_name


def test_ensure_schema_adds_missing_match_columns() -> None:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE competition (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR(180) NOT NULL,
                    normalized_name VARCHAR(180) NOT NULL,
                    country VARCHAR(100),
                    competition_type VARCHAR(40),
                    source VARCHAR(80),
                    external_id VARCHAR(120),
                    created_at DATETIME,
                    updated_at DATETIME
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE season (
                    id INTEGER PRIMARY KEY,
                    competition_id INTEGER NOT NULL,
                    name VARCHAR(80) NOT NULL,
                    start_date DATE,
                    end_date DATE,
                    is_current BOOLEAN NOT NULL,
                    created_at DATETIME,
                    updated_at DATETIME
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE team (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR(180) NOT NULL,
                    normalized_name VARCHAR(180) NOT NULL,
                    country VARCHAR(100),
                    external_id VARCHAR(120),
                    created_at DATETIME,
                    updated_at DATETIME
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE match (
                    id INTEGER PRIMARY KEY,
                    competition_id INTEGER NOT NULL,
                    season_id INTEGER NOT NULL,
                    matchday INTEGER,
                    match_date DATETIME NOT NULL,
                    home_team_id INTEGER NOT NULL,
                    away_team_id INTEGER NOT NULL,
                    stadium_id INTEGER,
                    home_score INTEGER,
                    away_score INTEGER,
                    status VARCHAR(40) NOT NULL,
                    is_friendly BOOLEAN NOT NULL,
                    source VARCHAR(80),
                    external_id VARCHAR(120),
                    created_at DATETIME,
                    updated_at DATETIME
                )
                """
            )
        )

    ensure_schema(engine)
    session = sessionmaker(bind=engine)()
    competition = Competition(
        name="LaLiga",
        normalized_name=normalize_name("LaLiga"),
        country="Spain",
        competition_type="domestic_league",
    )
    session.add(competition)
    session.flush()
    season = Season(competition_id=competition.id, name="2025/2026", is_current=True)
    home = Team(name="Getafe", normalized_name=normalize_name("Getafe"))
    away = Team(name="Osasuna", normalized_name=normalize_name("Osasuna"))
    session.add_all([season, home, away])
    session.flush()
    match = Match(
        competition_id=competition.id,
        season_id=season.id,
        match_date=__import__("datetime").datetime.now(__import__("datetime").UTC),
        home_team_id=home.id,
        away_team_id=away.id,
        home_score=1,
        away_score=0,
        home_shots_on_target=4,
        home_odds=1.45,
        status="finished",
    )
    session.add(match)
    session.commit()
    loaded = session.get(Match, match.id)
    assert loaded is not None
    assert loaded.home_shots_on_target == 4
    session.close()
