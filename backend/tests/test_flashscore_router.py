from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routers import flashscore
from app.schemas.api import FlashscoreTickResult


def test_flashscore_tick_requires_cron_authorization(monkeypatch) -> None:
    monkeypatch.setattr(flashscore, "get_settings", lambda: SimpleNamespace(cron_secret="cron-secret"))

    with pytest.raises(HTTPException) as error:
        flashscore.tick_flashscore_alerts("Bearer wrong", db=SimpleNamespace())

    assert error.value.status_code == 401


def test_flashscore_tick_uses_sofascore_signal_service(monkeypatch) -> None:
    monkeypatch.setattr(flashscore, "get_settings", lambda: SimpleNamespace(cron_secret="cron-secret"))
    monkeypatch.setattr(
        flashscore,
        "run_flashscore_signal_tick",
        lambda db, config: FlashscoreTickResult(
            status="ok",
            checked=2,
            eligible=1,
            emails_sent=1,
            message="ok",
        ),
    )

    result = flashscore.tick_flashscore_alerts("Bearer cron-secret", db=SimpleNamespace())

    assert result.checked == 2
    assert result.eligible == 1
    assert result.emails_sent == 1
