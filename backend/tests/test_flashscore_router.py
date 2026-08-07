from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routers import flashscore
from app.schemas.api import FlashscoreMatchRead, FlashscoreMatchesResult, ForebetStartEmailResult


def test_flashscore_tick_requires_cron_authorization(monkeypatch) -> None:
    monkeypatch.setattr(flashscore, "get_settings", lambda: SimpleNamespace(cron_secret="cron-secret"))

    with pytest.raises(HTTPException) as error:
        flashscore.tick_flashscore_alerts("Bearer wrong")

    assert error.value.status_code == 401


def test_flashscore_tick_sends_one_idempotent_email(monkeypatch) -> None:
    settings = SimpleNamespace(cron_secret="cron-secret")
    match = FlashscoreMatchRead(
        event_id="match-1",
        competition="LaLiga",
        home_team="Getafe",
        away_team="Celta",
        status="1st Half",
        minute=24,
        home_score=1,
        away_score=0,
        home_odds=1.45,
        away_odds=7.5,
        favorite_side="home",
        favorite_team="Getafe",
        favorite_odds=1.45,
        alert_eligible=True,
    )
    sent = []
    monkeypatch.setattr(flashscore, "get_settings", lambda: settings)
    monkeypatch.setattr(
        flashscore,
        "fetch_flashscore_matches",
        lambda day, config: FlashscoreMatchesResult(
            status="ok",
            message="ok",
            configured=True,
            matches=[match],
        ),
    )
    monkeypatch.setattr(
        flashscore,
        "send_flashscore_goal_email",
        lambda payload, config: sent.append(payload) or ForebetStartEmailResult(
            configured=True,
            sent=True,
            status="sent",
            message="sent",
        ),
    )

    result = flashscore.tick_flashscore_alerts("Bearer cron-secret")

    assert result.checked == 1
    assert result.eligible == 1
    assert result.emails_sent == 1
    assert sent[0].event_id == "match-1"
