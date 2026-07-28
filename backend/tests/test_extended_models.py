from datetime import UTC, date, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    Alert,
    AnalysisResult,
    Competition,
    Lineup,
    Match,
    Player,
    PlayerAlias,
    PlayerAvailability,
    PlayerMatchStats,
    PlayerTeamHistory,
    Season,
    Stadium,
    StatisticalConfig,
    Team,
    TeamFormSnapshot,
    TeamGoalTiming,
)


def test_phase_2_models_can_be_persisted() -> None:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    now = datetime(2026, 8, 14, 12, 0, tzinfo=UTC)

    with testing_session() as db:
        competition = Competition(name="LaLiga", normalized_name="laliga", country="Spain", source="manual")
        home = Team(name="Getafe", normalized_name="getafe", country="Spain", external_id="team-getafe")
        away = Team(name="Osasuna", normalized_name="osasuna", country="Spain", external_id="team-osasuna")
        stadium = Stadium(name="Coliseum", normalized_name="coliseum", city="Getafe", country="Spain")
        db.add_all([competition, home, away, stadium])
        db.flush()

        season = Season(competition_id=competition.id, name="2026/2027", is_current=True)
        player = Player(
            full_name="Borja Mayoral",
            normalized_name="borja mayoral",
            date_of_birth=date(1997, 4, 5),
            nationality="Spain",
            primary_position="forward",
            external_id="player-borja-mayoral",
        )
        db.add_all([season, player])
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
            external_id="match-2",
        )
        db.add(match)
        db.flush()

        db.add(PlayerAlias(player_id=player.id, source="manual", alias="B. Mayoral", normalized_alias="b mayoral"))
        db.add(
            PlayerTeamHistory(
                player_id=player.id,
                team_id=home.id,
                season_id=season.id,
                start_date=date(2026, 7, 1),
                shirt_number=9,
            )
        )
        db.add(
            TeamFormSnapshot(
                team_id=home.id,
                competition_id=competition.id,
                season_id=season.id,
                snapshot_date=now,
                matches_considered=10,
                points=13,
                goals_for=11,
                goals_against=10,
                clean_sheet_percentage=30,
                over_25_percentage=40,
                btts_percentage=50,
            )
        )
        db.add(
            PlayerAvailability(
                player_id=player.id,
                match_id=match.id,
                status="doubtful",
                reason="Muscle issue",
                source="manual",
                confidence=80,
                first_detected_at=now,
                last_checked_at=now,
            )
        )
        db.add(
            Lineup(
                match_id=match.id,
                team_id=home.id,
                player_id=player.id,
                status="starting",
                position="forward",
                shirt_number=9,
                source="manual",
                captured_at=now,
            )
        )
        db.add(
            TeamGoalTiming(
                team_id=home.id,
                competition_id=competition.id,
                season_id=season.id,
                venue_type="home",
                interval_start=76,
                interval_end=90,
                goals_scored=4,
                goals_conceded=6,
                matches_played=10,
                percentage_scored=25,
                percentage_conceded=35,
                calculated_at=now,
            )
        )
        db.add(
            PlayerMatchStats(
                player_id=player.id,
                match_id=match.id,
                team_id=home.id,
                opponent_team_id=away.id,
                stadium_id=stadium.id,
                competition_id=competition.id,
                season_id=season.id,
                started=True,
                minutes_played=90,
                position_played="forward",
                goals=1,
                assists=0,
                expected_goals=0.42,
                expected_assists=0.07,
                rating=7.2,
                was_home_team=True,
                captured_at=now,
                source="manual",
            )
        )
        db.add(
            AnalysisResult(
                match_id=match.id,
                analysis_type="closed_midtable",
                score=81.84,
                reliability="acceptable",
                sample_size=214,
                explanation="Comparable sample supports a low-goal association.",
                payload={"under_25": 67.2},
                calculated_at=now,
            )
        )
        db.add(
            Alert(
                match_id=match.id,
                alert_type="important_absence",
                reason="Starting forward is doubtful.",
                supporting_data={"importance": 89},
                sample_size=12,
                reliability="provisional",
                created_at=now,
                updated_at=now,
            )
        )
        db.add(
            StatisticalConfig(
                key="closed_midtable_weights",
                value={"centrality": 0.25, "classification_distance": 0.20},
                description="Initial configurable weights for the match balance index.",
            )
        )
        db.commit()

        assert db.query(Player).count() == 1
        assert db.query(PlayerMatchStats).count() == 1
        assert db.query(AnalysisResult).count() == 1
        assert db.query(Alert).count() == 1
