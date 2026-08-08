from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.services import flashscore_provider


@pytest.fixture(autouse=True)
def clear_flashscore_cache() -> None:
    flashscore_provider._RESULT_CACHE.clear()


def settings(api_key: str | None = "rapid-key"):
    return SimpleNamespace(rapidapi_key=api_key, flashscore_api_host="flashscore4.p.rapidapi.com")


def test_flashscore_provider_marks_low_odds_goal_before_minute_30(monkeypatch) -> None:
    schedule = {
        "data": [{
            "tournament": {"name": "LaLiga"},
            "events": [{
                "id": "match-1",
                "start_time": "2026-08-07T20:00:00Z",
                "home_team": {"name": "Getafe"},
                "away_team": {"name": "Celta"},
                "status": "scheduled",
            }],
        }]
    }
    live = {
        "matches": [{
            "event_id": "match-1",
            "home_team": {"name": "Getafe"},
            "away_team": {"name": "Celta"},
            "stage": "1st Half",
            "live_time": "24'",
            "home_score": 1,
            "away_score": 0,
        }]
    }
    odds = {
        "events": [{
            "event_id": "match-1",
            "odds": [
                {"selection": "HOME", "odds": 1.45},
                {"selection": "DRAW", "odds": 4.2},
                {"selection": "AWAY", "odds": 7.5},
            ],
        }]
    }

    def fake_get_json(url, headers, params):
        if url.endswith("/matches/list"):
            return schedule
        if url.endswith("/matches/live"):
            return live
        if url.endswith("/matches/odds"):
            assert params["match_id"] == "match-1"
            return odds
        if "/livescores/sports/" in url and url.endswith("/odds"):
            raise flashscore_provider.requests.RequestException("bulk unavailable")
        return odds

    monkeypatch.setattr(flashscore_provider, "_get_json", fake_get_json)

    result = flashscore_provider.fetch_flashscore_matches(settings=settings())

    assert result.status == "ok"
    assert len(result.matches) == 1
    match = result.matches[0]
    assert match.competition == "LaLiga"
    assert match.minute == 24
    assert match.home_score == 1
    assert match.home_odds == 1.45
    assert match.favorite_team == "Getafe"
    assert match.favorite_side == "home"
    assert match.alert_eligible is True


def test_flashscore_provider_lists_up_to_1_60_but_alerts_only_to_1_50(monkeypatch) -> None:
    now = datetime.now(UTC)
    payload = {
        "matches": [{
            "id": "match-2",
            "home_team": "Local",
            "away_team": "Visitante",
            "minute": 20,
            "home_score": 2,
            "away_score": 0,
            "start_time": (now - timedelta(minutes=20)).isoformat().replace("+00:00", "Z"),
        }]
    }
    odds = {
        "events": [{
            "id": "match-2",
            "home_odds": 1.55,
            "draw_odds": 3.5,
            "away_odds": 6.0,
        }]
    }

    monkeypatch.setattr(
        flashscore_provider,
        "_get_json",
        lambda url, headers, params: odds if url.endswith("/odds") else payload,
    )

    result = flashscore_provider.fetch_flashscore_matches(settings=settings())
    match = result.matches[0]

    assert result.threshold == 1.6
    assert match.home_odds == 1.55
    assert match.favorite_team == "Local"
    assert match.alert_eligible is False


def test_flashscore_provider_excludes_matches_above_1_60(monkeypatch) -> None:
    schedule = [{
        "name": "Test League",
        "matches": [{
            "match_id": "match-3",
            "home_team": {"name": "Local"},
            "away_team": {"name": "Visitante"},
            "match_status": "scheduled",
            "odds": {"1": "1.70", "X": "3.50", "2": "4.80"},
        }],
    }]
    monkeypatch.setattr(
        flashscore_provider,
        "_get_json",
        lambda url, headers, params: schedule if url.endswith("/matches/list") else (_ for _ in ()).throw(
            flashscore_provider.requests.RequestException("skip")
        ),
    )

    result = flashscore_provider.fetch_flashscore_matches(settings=settings())
    assert result.matches == []


def test_flashscore_provider_reports_missing_api_key() -> None:
    result = flashscore_provider.fetch_flashscore_matches(settings=settings(None))

    assert result.configured is False
    assert result.status == "not_configured"
    assert result.matches == []


def test_flashscore_provider_explains_missing_subscription(monkeypatch) -> None:
    class FakeResponse:
        ok = False
        status_code = 403
        reason = "Forbidden"
        text = '{"message":"You are not subscribed to this API."}'

        def json(self):
            return {"message": "You are not subscribed to this API."}

    monkeypatch.setattr(flashscore_provider.requests, "get", lambda *args, **kwargs: FakeResponse())
    flashscore_provider._RESULT_CACHE.clear()

    result = flashscore_provider.fetch_flashscore_matches(settings=settings())

    assert result.status == "request_failed"
    assert "cuotas" in result.message.lower()
    assert "suscripcion" in result.message.lower()
    assert result.matches == []


def test_flashscore_provider_reads_tournament_grouped_list(monkeypatch) -> None:
    schedule = [{
        "name": "Premier League",
        "country_name": "England",
        "tournament_id": "t1",
        "matches": [{
            "match_id": "m-10",
            "timestamp": "2026-08-08T14:00:00Z",
            "home_team": {"name": "Arsenal"},
            "away_team": {"name": "Chelsea"},
            "match_status": "scheduled",
            "odds": [
                {"name": "bet365", "image": "x", "odds": {"1": "1.40", "X": "4.50", "2": "8.00"}},
            ],
            "scores": {"home": 0, "away": 0},
        }],
    }]

    monkeypatch.setattr(
        flashscore_provider,
        "_get_json",
        lambda url, headers, params: schedule if url.endswith("/matches/list") else (_ for _ in ()).throw(
            flashscore_provider.requests.RequestException("skip")
        ),
    )

    result = flashscore_provider.fetch_flashscore_matches(settings=settings())
    match = result.matches[0]
    assert match.competition == "Premier League"
    assert match.home_team == "Arsenal"
    assert match.home_odds == 1.4
    assert match.favorite_team == "Arsenal"
    assert match.favorite_odds == 1.4
