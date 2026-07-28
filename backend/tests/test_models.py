from datetime import UTC, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.models import Competition, ForebetPrediction, Match, Season, Stadium, StandingsSnapshot, Team, TeamAlias


def test_initial_models_can_be_persisted() -> None:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    with testing_session() as db:
        competition = Competition(name="LaLiga", normalized_name="laliga", country="Spain", source="manual")
        home = Team(name="Getafe", normalized_name="getafe", country="Spain", external_id="team-getafe")
        away = Team(name="Osasuna", normalized_name="osasuna", country="Spain", external_id="team-osasuna")
        stadium = Stadium(name="Coliseum", normalized_name="coliseum", city="Getafe", country="Spain")
        db.add_all([competition, home, away, stadium])
        db.flush()

        season = Season(competition_id=competition.id, name="2026/2027", is_current=True)
        db.add(season)
        db.flush()

        match = Match(
            competition_id=competition.id,
            season_id=season.id,
            matchday=1,
            match_date=datetime(2026, 8, 15, 19, 30, tzinfo=UTC),
            home_team_id=home.id,
            away_team_id=away.id,
            stadium_id=stadium.id,
            status="scheduled",
            source="manual",
            external_id="match-1",
        )
        db.add(match)
        db.flush()

        db.add(TeamAlias(team_id=home.id, source="manual", alias="Getafe CF", normalized_alias="getafe cf"))
        db.add(
            StandingsSnapshot(
                competition_id=competition.id,
                season_id=season.id,
                team_id=home.id,
                matchday=1,
                snapshot_date=datetime(2026, 8, 14, 12, 0, tzinfo=UTC),
                position=10,
                played=0,
                won=0,
                drawn=0,
                lost=0,
                goals_for=0,
                goals_against=0,
                goal_difference=0,
                points=0,
            )
        )
        db.add(
            ForebetPrediction(
                match_id=match.id,
                captured_at=datetime(2026, 8, 14, 9, 0, tzinfo=UTC),
                home_probability=38.5,
                draw_probability=31.0,
                away_probability=30.5,
                prediction="1X",
                predicted_home_score=1,
                predicted_away_score=1,
                expected_goals=2.1,
                over_under_prediction="under_2_5",
                both_teams_score_prediction="yes",
                source_url="https://www.forebet.com/",
            )
        )

        db.commit()

        assert db.query(Match).count() == 1
        assert db.query(ForebetPrediction).count() == 1
        assert db.query(StandingsSnapshot).count() == 1
