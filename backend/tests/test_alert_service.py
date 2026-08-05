from collections.abc import Generator
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Competition, ForebetPrediction, Match, Season, Team
from app.services.alert_service import generate_match_alerts


def _session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = testing_session()
    try:
        yield db
    finally:
        db.close()


def _seed_match(db: Session, *, predicted_home: int, predicted_away: int, over_under: str | None) -> Match:
    competition = Competition(
        name="LaLiga",
        normalized_name="laliga",
        country="Spain",
        competition_type="domestic_league",
    )
    db.add(competition)
    db.flush()
    season = Season(competition_id=competition.id, name="2026/2027", is_current=True)
    home = Team(name="Getafe", normalized_name="getafe")
    away = Team(name="Celta", normalized_name="celta")
    db.add_all([season, home, away])
    db.flush()
    match = Match(
        competition_id=competition.id,
        season_id=season.id,
        home_team_id=home.id,
        away_team_id=away.id,
        match_date=datetime(2026, 8, 15, 19, 30, tzinfo=UTC),
        status="scheduled",
        is_friendly=False,
        source="test",
        external_id="alert-match-1",
    )
    db.add(match)
    db.flush()
    db.add(
        ForebetPrediction(
            match_id=match.id,
            captured_at=datetime(2026, 8, 14, 9, 0, tzinfo=UTC),
            prediction="2",
            predicted_home_score=predicted_home,
            predicted_away_score=predicted_away,
            expected_goals=Decimal("2.90") if predicted_home + predicted_away > 2 else Decimal("2.10"),
            over_under_prediction=over_under,
            source_url="https://www.forebet.com/",
        )
    )
    db.commit()
    return match


def test_generate_match_alerts_creates_forebet_over_signal() -> None:
    db = next(_session())
    match = _seed_match(db, predicted_home=1, predicted_away=2, over_under="over_2_5")

    alerts = generate_match_alerts(db, match.id)
    alert_types = {alert.alert_type for alert in alerts}

    assert "forebet_over_signal" in alert_types
    over_alert = next(alert for alert in alerts if alert.alert_type == "forebet_over_signal")
    assert "over_2_5" in over_alert.reason
    assert over_alert.supporting_data["predicted_score"] == "1-2"


def test_generate_match_alerts_derives_under_when_over_under_missing() -> None:
    db = next(_session())
    match = _seed_match(db, predicted_home=0, predicted_away=1, over_under=None)

    alerts = generate_match_alerts(db, match.id)
    under_alerts = [alert for alert in alerts if alert.alert_type == "forebet_under_signal"]

    assert under_alerts
    assert under_alerts[0].supporting_data["over_under_prediction"] == "under_2_5"
    assert under_alerts[0].supporting_data["predicted_score"] == "0-1"
