from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.database import Base, SessionLocal, engine
from app.models import StatisticalConfig
from app.schemas.api import FlashscoreMatchRead
from app.services import flashscore_watch


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
    board = [
        FlashscoreMatchRead(
            event_id="fs-1",
            competition="LaLiga",
            home_team="Getafe",
            away_team="Celta",
            status="inprogress",
            minute=17,
            home_score=1,
            away_score=0,
            home_odds=1.2,
            favorite_odds=1.2,
        )
    ]

    merged = flashscore_watch.merge_flashscore_live_board([match], board)

    assert merged[0].minute == 17
    assert merged[0].home_odds == 1.4
    assert merged[0].favorite_odds == 1.4
    assert merged[0].early_favorite_goal is True
    assert merged[0].early_goal_minute == 17
    assert merged[0].alert_eligible is True


def test_with_early_goal_flags_keeps_goal_minute_after_halftime() -> None:
    flagged = flashscore_watch.with_early_goal_flags(
        FlashscoreMatchRead(
            event_id="hiroshima",
            competition="Japan: J1 League",
            home_team="Sanfrecce Hiroshima",
            away_team="Chiba",
            status="halftime",
            minute=None,
            home_score=1,
            away_score=0,
            favorite_side="home",
            favorite_team="Sanfrecce Hiroshima",
            favorite_odds=1.35,
            early_goal_minute=14,
        )
    )

    assert flagged.early_goal is True
    assert flagged.early_favorite_goal is True
    assert flagged.early_goal_minute == 14
    assert flagged.alert_eligible is True


def test_save_watch_keeps_only_favorites_at_or_below_1_60() -> None:
    with SessionLocal() as db:
        watch = flashscore_watch.save_flashscore_watch(
            db,
            day=0,
            captured_at=datetime.now(UTC),
            matches=[
                FlashscoreMatchRead(
                    event_id="keep",
                    competition="LaLiga",
                    home_team="A",
                    away_team="B",
                    status="scheduled",
                    favorite_odds=1.55,
                    favorite_team="A",
                    favorite_side="home",
                ),
                FlashscoreMatchRead(
                    event_id="drop",
                    competition="LaLiga",
                    home_team="C",
                    away_team="D",
                    status="scheduled",
                    home_odds=1.8,
                    away_odds=4.0,
                ),
            ],
        )

    assert [match.event_id for match in watch.matches] == ["keep"]


def test_signal_tick_skips_flashscore_when_slow_window_was_just_polled(monkeypatch) -> None:
    now = datetime.now(UTC)
    with SessionLocal() as db:
        flashscore_watch.save_flashscore_watch(
            db,
            day=0,
            captured_at=now,
            last_live_poll_at=now - timedelta(minutes=1),
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
        "fetch_flashscore_live_board",
        lambda *args, **kwargs: called.__setitem__("live", True) or [],
    )

    with SessionLocal() as db:
        result = flashscore_watch.run_flashscore_signal_tick(
            db,
            settings=SimpleNamespace(rapidapi_key="test-key"),
        )

    assert result.status == "idle"
    assert called["live"] is False
    assert "5 min" in result.message


def test_signals_start_from_kickoff_time() -> None:
    now = datetime(2026, 8, 8, 17, 50, tzinfo=UTC)
    upcoming = FlashscoreMatchRead(
        event_id="soon",
        competition="LaLiga",
        home_team="A",
        away_team="B",
        status="scheduled",
        favorite_odds=1.4,
        favorite_team="A",
        favorite_side="home",
        start_time=now + timedelta(minutes=10),
    )
    past_kickoff = upcoming.model_copy(update={"start_time": now - timedelta(minutes=5)})
    late_without_clock = upcoming.model_copy(update={"start_time": now - timedelta(minutes=40)})
    live = past_kickoff.model_copy(update={"status": "inprogress", "minute": 5})
    assert flashscore_watch.has_match_started(upcoming, now) is False
    assert flashscore_watch.needs_live_poll(upcoming, now) is False
    assert flashscore_watch.needs_fast_live_poll(upcoming, now) is False
    assert flashscore_watch.has_match_started(past_kickoff, now) is True
    assert flashscore_watch.needs_live_poll(past_kickoff, now) is True
    assert flashscore_watch.needs_fast_live_poll(past_kickoff, now) is True
    assert flashscore_watch.needs_fast_live_poll(late_without_clock, now) is False
    assert flashscore_watch.has_match_started(live, now) is True
    assert flashscore_watch.needs_fast_live_poll(live, now) is True


def test_finished_and_stale_scheduled_matches_do_not_need_live_poll() -> None:
    now = datetime(2026, 8, 8, 20, 0, tzinfo=UTC)
    finished = FlashscoreMatchRead(
        event_id="done",
        competition="LaLiga",
        home_team="A",
        away_team="B",
        status="finished",
        home_score=2,
        away_score=1,
        favorite_odds=1.4,
        favorite_team="A",
        favorite_side="home",
        start_time=now - timedelta(hours=3),
    )
    stale = FlashscoreMatchRead(
        event_id="stale",
        competition="LaLiga",
        home_team="C",
        away_team="D",
        status="scheduled",
        home_score=1,
        away_score=0,
        favorite_odds=1.4,
        favorite_team="C",
        favorite_side="home",
        start_time=now - timedelta(hours=3),
    )
    assert flashscore_watch.is_match_finished(finished, now) is True
    assert flashscore_watch.is_match_finished(stale, now) is True
    assert flashscore_watch.needs_live_poll(finished, now) is False
    assert flashscore_watch.needs_live_poll(stale, now) is False


def test_signal_tick_skips_finished_watchlist(monkeypatch) -> None:
    now = datetime.now(UTC)
    with SessionLocal() as db:
        flashscore_watch.save_flashscore_watch(
            db,
            day=0,
            captured_at=now,
            matches=[
                FlashscoreMatchRead(
                    event_id="fs-done",
                    competition="LaLiga",
                    home_team="Getafe",
                    away_team="Celta",
                    status="scheduled",
                    home_score=2,
                    away_score=0,
                    home_odds=1.4,
                    away_odds=7.0,
                    favorite_side="home",
                    favorite_team="Getafe",
                    favorite_odds=1.4,
                    start_time=now - timedelta(hours=3),
                )
            ],
        )

    called = {"live": False}
    monkeypatch.setattr(
        flashscore_watch,
        "fetch_flashscore_live_board",
        lambda *args, **kwargs: called.__setitem__("live", True) or [],
    )

    with SessionLocal() as db:
        result = flashscore_watch.run_flashscore_signal_tick(
            db,
            settings=SimpleNamespace(rapidapi_key="test-key"),
        )
        watch = flashscore_watch.load_flashscore_watch(db)

    assert result.status == "idle"
    assert called["live"] is False
    assert "acabados" in result.message
    assert watch is not None
    assert watch.matches[0].status == "finished"


def test_signal_tick_uses_flashscore_ultra_watchlist(monkeypatch) -> None:
    now = datetime.now(UTC)
    with SessionLocal() as db:
        flashscore_watch.save_flashscore_watch(
            db,
            day=0,
            captured_at=now,
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
                    start_time=now - timedelta(minutes=5),
                )
            ],
        )

    monkeypatch.setattr(
        flashscore_watch,
        "fetch_flashscore_live_board",
        lambda *args, **kwargs: [
            FlashscoreMatchRead(
                event_id="fs-1",
                competition="LaLiga",
                home_team="Getafe",
                away_team="Celta",
                status="inprogress",
                minute=12,
                home_score=1,
                away_score=0,
            )
        ],
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
            settings=SimpleNamespace(rapidapi_key="test-key"),
        )

    assert result.status == "ok"
    assert result.eligible == 1
    assert result.emails_sent == 1
    assert sent[0].event_id == "fs-1"
    assert "Ultra" in result.message
