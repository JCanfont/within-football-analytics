from datetime import UTC, datetime
from types import SimpleNamespace

import requests

from app.schemas.api import ForebetStartEmailRequest
from app.services.email_alerts import send_forebet_start_email


def payload() -> ForebetStartEmailRequest:
    return ForebetStartEmailRequest(
        home_team="Getafe",
        away_team="Celta",
        match_date=datetime(2026, 8, 6, 19, 0, tzinfo=UTC),
        competition="LaLiga",
        home_score=1,
        away_score=0,
        over_under="Over 2.5",
    )


def test_start_email_reports_missing_configuration() -> None:
    settings = SimpleNamespace(
        resend_api_key=None,
        forebet_alert_email=None,
        forebet_alert_from="WITHIN <onboarding@resend.dev>",
    )

    result = send_forebet_start_email(payload(), settings)

    assert result.configured is False
    assert result.sent is False
    assert result.status == "not_configured"


def test_start_email_sends_to_server_configured_recipient(monkeypatch) -> None:
    captured = {}

    class Response:
        def raise_for_status(self) -> None:
            return None

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return Response()

    monkeypatch.setattr(requests, "post", fake_post)
    settings = SimpleNamespace(
        resend_api_key="test-key",
        forebet_alert_email="alerts@example.com",
        forebet_alert_from="WITHIN <onboarding@resend.dev>",
    )

    result = send_forebet_start_email(payload(), settings)

    assert result.configured is True
    assert result.sent is True
    assert captured["json"]["to"] == ["alerts@example.com"]
    assert captured["json"]["subject"] == "Iniciado: Getafe - Celta"
    assert "Resultado actual: <strong>1-0</strong>" in captured["json"]["html"]


def test_start_email_handles_provider_errors(monkeypatch) -> None:
    def fail_post(*args, **kwargs):
        raise requests.RequestException("provider unavailable")

    monkeypatch.setattr(requests, "post", fail_post)
    settings = SimpleNamespace(
        resend_api_key="test-key",
        forebet_alert_email="alerts@example.com",
        forebet_alert_from="WITHIN <onboarding@resend.dev>",
    )

    result = send_forebet_start_email(payload(), settings)

    assert result.configured is True
    assert result.sent is False
    assert result.status == "provider_error"
