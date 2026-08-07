from types import SimpleNamespace

from app.services import flashscore_provider


def settings(api_key: str | None = "rapid-key"):
    return SimpleNamespace(rapidapi_key=api_key, flashscore_api_host="flashscore4.p.rapidapi.com")


def test_flashscore_provider_marks_low_odds_goal_before_minute_30(monkeypatch) -> None:
    schedule = {
        "data": [{
            "id": "match-1",
            "start_time": "2026-08-07T20:00:00Z",
            "tournament": {"name": "LaLiga"},
            "home_team": {"name": "Getafe"},
            "away_team": {"name": "Celta"},
            "status": "scheduled",
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
        return odds

    monkeypatch.setattr(flashscore_provider, "_get_json", fake_get_json)

    result = flashscore_provider.fetch_flashscore_matches(settings=settings())

    assert result.status == "ok"
    assert len(result.matches) == 1
    match = result.matches[0]
    assert match.minute == 24
    assert match.home_score == 1
    assert match.home_odds == 1.45
    assert match.favorite_team == "Getafe"
    assert match.favorite_side == "home"
    assert match.alert_eligible is True


def test_flashscore_provider_does_not_alert_above_threshold(monkeypatch) -> None:
    payload = {
        "matches": [{
            "id": "match-2",
            "home_team": "Local",
            "away_team": "Visitante",
            "minute": 20,
            "home_score": 2,
            "away_score": 0,
        }]
    }
    odds = {
        "events": [{
            "id": "match-2",
            "home_odds": 1.51,
            "draw_odds": 3.5,
            "away_odds": 6.0,
        }]
    }

    monkeypatch.setattr(
        flashscore_provider,
        "_get_json",
        lambda url, headers, params: odds if url.endswith("/odds") else payload,
    )

    match = flashscore_provider.fetch_flashscore_matches(settings=settings()).matches[0]

    assert match.home_odds == 1.51
    assert match.favorite_team is None
    assert match.alert_eligible is False


def test_flashscore_provider_reports_missing_api_key() -> None:
    result = flashscore_provider.fetch_flashscore_matches(settings=settings(None))

    assert result.configured is False
    assert result.status == "not_configured"
    assert result.matches == []
