from datetime import UTC, datetime
from types import SimpleNamespace

from app.database import SessionLocal, engine
from app.models import StatisticalConfig
from app.schemas.api import FlashscoreMatchRead, SofaScoreTeamEvent
from app.services import flashscore_watch
from app.database import Base


def setup_module() -> None:
    Base.metadata.create_all(bind=engine)


def teardown_function() -> None:
    with SessionLocal() as db:
        db.query(StatisticalConfig).filter(StatisticalConfig.key == flashscore_watch.FLASHSCORE_WATCH_KEY).delete()
        db.commit()


def test_merge_marks_early_favorite_goal() -> None:
    match = FlashscoreMatchRead(
        event_id="fs-1",
        competition="LaLiga",
        home_team="Getafe",
        away_team="Celta",
        status="scheduled",
        home_odds=1.4,
        away_odds=7.0,
        favorite_side="home",
        favorite_team="Getafe",
        favorite_odds=1.4,
    )
    events = [
        SofaScoreTeamEvent(
            event_id=99,
            start_time=datetime(2026, 8, 8, 18, 0, tzinfo=UTC),
            status="inprogress",
            minute=17,
            competition="LaLiga",
            home_team="Getafe CF",
            away_team="RC Celta",
            home_score=1,
            away_score=0,
        )
    ]

    merged = flashscore_watch.merge_flashscore_with_sofascore([match], events)

    assert merged[0].minute == 17
    assert merged[0].early_favorite_goal is True
    assert merged[0].alert_eligible is True


def test_signal_tick_skips_sofascore_when_outside_critical_window(monkeypatch) -> None:
    with SessionLocal() as db:
        flashscore_watch.save_flashscore_watch(
            db,
            day=0,
            captured_at=datetime.now(UTC),
            matches=[
                FlashscoreMatchRead(
                    event_id="fs-1",
                    competition="LaLiga",
                    home_team="Getafe",
                    away_team="Celta",
                    status="inprogress",
                    minute=70,
                    home_score=0,
                    away_score=0,
                    home_odds=1.4,
                    away_odds=7.0,
                    favorite_side="home",
                    favorite_team="Getafe",
                    favorite_odds=1.4,
                )
            ],
        )

    called = {"live": False}
    monkeypatch.setattr(
        flashscore_watch,
        "fetch_live_events",
        lambda sport="football": called.__setitem__("live", True),
    )

    with SessionLocal() as db:
        result = flashscore_watch.run_flashscore_signal_tick(
            db,
            settings=SimpleNamespace(crawlora_api_key="test-key"),
        )

    assert result.status == "idle"
    assert called["live"] is False


def test_signal_tick_uses_sofascore_watchlist(monkeypatch) -> None:
    with SessionLocal() as db:
        flashscore_watch.save_flashscore_watch(
            db,
            day=0,
            captured_at=datetime.now(UTC),
            matches=[
                FlashscoreMatchRead(
                    event_id="fs-1",
                    competition="LaLiga",
                    home_team="Getafe",
                    away_team="Celta",
                    status="scheduled",
                    home_odds=1.4,
                    away_odds=7.0,
                    favorite_side="home",
                    favorite_team="Getafe",
                    favorite_odds=1.4,
                )
            ],
        )

    monkeypatch.setattr(
        flashscore_watch,
        "fetch_live_events",
        lambda sport="football": SimpleNamespace(
            events=[
                SofaScoreTeamEvent(
                    event_id=99,
                    start_time=datetime(2026, 8, 8, 18, 0, tzinfo=UTC),
                    status="inprogress",
                    minute=12,
                    competition="LaLiga",
                    home_team="Getafe CF",
                    away_team="RC Celta",
                    home_score=1,
                    away_score=0,
                )
            ]
        ),
    )
    sent = []
    monkeypatch.setattr(
        flashscore_watch,
        "send_flashscore_goal_email",
        lambda payload, settings: sent.append(payload) or SimpleNamespace(status="sent", sent=True),
    )

    with SessionLocal() as db:
        result = flashscore_watch.run_flashscore_signal_tick(
            db,
            settings=SimpleNamespace(crawlora_api_key="test-key"),
        )

    assert result.status == "ok"
    assert result.eligible == 1
    assert result.emails_sent == 1
    assert sent[0].event_id == "fs-1"
