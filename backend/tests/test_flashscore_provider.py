from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.services import flashscore_provider


@pytest.fixture(autouse=True)
def clear_flashscore_cache() -> None:
    flashscore_provider._RESULT_CACHE.clear()
    flashscore_provider._BOARD_CACHE.clear()


def settings(api_key: str | None = "rapid-key"):
    return SimpleNamespace(rapidapi_key=api_key, flashscore_api_host="flashscore4.p.rapidapi.com")


def test_flashscore_provider_marks_low_odds_goal_before_minute_30(monkeypatch) -> None:
    schedule = [{
        "name": "LaLiga",
        "matches": [{
            "match_id": "match-1",
            "timestamp": "2026-08-07T20:00:00Z",
            "home_team": {"name": "Getafe"},
            "away_team": {"name": "Celta"},
            "match_status": "1st Half",
            "live_time": "24'",
            "scores": {"home": 1, "away": 0},
            "odds": {"1": "1.45", "X": "4.20", "2": "7.50"},
        }],
    }]

    monkeypatch.setattr(
        flashscore_provider,
        "_get_json",
        lambda url, headers, params: schedule if url.endswith("/matches/list") else (_ for _ in ()).throw(
            flashscore_provider.requests.RequestException("no extra calls")
        ),
    )

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
    schedule = [{
        "name": "Test League",
        "matches": [{
            "match_id": "match-2",
            "timestamp": (now - timedelta(minutes=20)).isoformat().replace("+00:00", "Z"),
            "home_team": {"name": "Local"},
            "away_team": {"name": "Visitante"},
            "match_status": "1st Half",
            "minute": 20,
            "scores": {"home": 2, "away": 0},
            "odds": {"1": "1.55", "X": "3.50", "2": "6.00"},
        }],
    }]

    monkeypatch.setattr(
        flashscore_provider,
        "_get_json",
        lambda url, headers, params: schedule if url.endswith("/matches/list") else (_ for _ in ()).throw(
            flashscore_provider.requests.RequestException("no extra calls")
        ),
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


def test_flashscore_provider_serves_stale_cache_when_rapidapi_fails(monkeypatch) -> None:
    schedule = [{
        "name": "LaLiga",
        "matches": [{
            "match_id": "match-9",
            "home_team": {"name": "A"},
            "away_team": {"name": "B"},
            "odds": {"1": "1.20", "X": "5.00", "2": "10.00"},
        }],
    }]
    calls = {"n": 0}

    def fake_get_json(url, headers, params):
        calls["n"] += 1
        if calls["n"] == 1:
            return schedule
        raise flashscore_provider.requests.HTTPError("429 too many requests", response=None)

    monkeypatch.setattr(flashscore_provider, "_get_json", fake_get_json)
    first = flashscore_provider.fetch_flashscore_matches(settings=settings())
    assert first.status == "ok"
    assert len(first.matches) == 1

    # Expire filtered-result and board caches but keep the stale RESULT window.
    cached_at, payload = flashscore_provider._RESULT_CACHE[0]
    flashscore_provider._RESULT_CACHE[0] = (cached_at - flashscore_provider.CACHE_TTL - timedelta(seconds=1), payload)
    flashscore_provider._BOARD_CACHE.clear()

    second = flashscore_provider.fetch_flashscore_matches(settings=settings())
    assert second.status == "ok"
    assert "ultima captura" in second.message.lower()
    assert len(second.matches) == 1


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


def test_flashscore_provider_reads_finished_flags_and_ignores_timestamp_minutes() -> None:
    assert flashscore_provider._status_value({"is_finished": True, "match_status": "2nd Half"}) == "finished"
    assert flashscore_provider._status_value({"is_in_progress": True}) == "live"
    assert flashscore_provider._minute_value({"time": "2026-08-08T20:00:00Z", "live_time": "24'"}) == 24
    assert flashscore_provider._minute_value({"time": "20:00"}) is None


def test_flashscore_provider_ignores_scalar_average_as_home_odd() -> None:
    home, draw, away = flashscore_provider._extract_one_x_two({
        "odds": {"avg": "1.45", "1": "2.10", "X": "3.20", "2": "3.40"},
    })
    assert home == 2.10
    assert draw == 3.20
    assert away == 3.40


def test_flashscore_provider_excludes_finished_favorites(monkeypatch) -> None:
    now = datetime.now(UTC)
    schedule = [{
        "name": "LaLiga",
        "matches": [
            {
                "match_id": "done-1",
                "timestamp": (now - timedelta(hours=3)).isoformat().replace("+00:00", "Z"),
                "home_team": {"name": "A"},
                "away_team": {"name": "B"},
                "match_status": "scheduled",
                "odds": {"1": "1.20", "X": "5.00", "2": "10.00"},
                "scores": {"home": 2, "away": 0},
            },
            {
                "match_id": "live-1",
                "timestamp": (now + timedelta(hours=2)).isoformat().replace("+00:00", "Z"),
                "home_team": {"name": "C"},
                "away_team": {"name": "D"},
                "match_status": "scheduled",
                "odds": {"1": "1.40", "X": "4.50", "2": "8.00"},
            },
        ],
    }]
    monkeypatch.setattr(
        flashscore_provider,
        "_get_json",
        lambda url, headers, params: schedule if "matches/list" in url else (_ for _ in ()).throw(
            flashscore_provider.requests.RequestException("skip")
        ),
    )

    result = flashscore_provider.fetch_flashscore_matches(settings=settings())
    assert [match.event_id for match in result.matches] == ["live-1"]
    assert "acabados excluidos" in result.message


def test_flashscore_provider_excludes_friendly_and_youth(monkeypatch) -> None:
    schedule = [
        {
            "name": "WORLD: Club Friendly",
            "matches": [{
                "match_id": "friendly-1",
                "home_team": {"name": "A"},
                "away_team": {"name": "B"},
                "odds": {"1": "1.20", "X": "5.00", "2": "10.00"},
            }],
        },
        {
            "name": "LaLiga",
            "matches": [{
                "match_id": "league-1",
                "home_team": {"name": "Getafe"},
                "away_team": {"name": "Celta"},
                "odds": {"1": "1.40", "X": "4.50", "2": "8.00"},
            }],
        },
    ]
    monkeypatch.setattr(
        flashscore_provider,
        "_get_json",
        lambda url, headers, params: schedule if "matches/list" in url else (_ for _ in ()).throw(
            flashscore_provider.requests.RequestException("skip")
        ),
    )

    result = flashscore_provider.fetch_flashscore_matches(settings=settings())
    assert [match.event_id for match in result.matches] == ["league-1"]
    assert "vigilables" in result.message


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
