from app.services import sofascore_crawlora_provider


SAMPLE_INCIDENTS = {
    "code": 200,
    "msg": "OK",
    "data": {
        "event_id": 14025013,
        "count": 4,
        "source_url": "https://api.sofascore.com/api/v1/event/14025013/incidents",
        "incidents": [
            {"type": "period", "text": "HT"},
            {"type": "goal", "time": 23, "is_home": True, "home_score": 1, "away_score": 0, "player": "A. Player"},
            {"type": "card", "time": 60, "is_home": False, "card_color": "yellow"},
            {"type": "goal", "time": 8, "added_time": 1, "is_home": False, "home_score": 1, "away_score": 1, "player": "B. Player"},
        ],
    },
}


def test_fetch_event_incidents_parses_goals_sorted_by_minute(monkeypatch) -> None:
    monkeypatch.setattr(
        sofascore_crawlora_provider,
        "_crawlora_get",
        lambda endpoint, **params: SAMPLE_INCIDENTS,
    )

    result = sofascore_crawlora_provider.fetch_event_incidents(14025013)

    assert result.event_id == 14025013
    # Only goals are kept, ordered by minute.
    assert [goal.minute for goal in result.goals] == [8, 23]
    first, second = result.goals
    assert first.is_home is False
    assert first.added_time == 1
    assert first.player == "B. Player"
    assert second.is_home is True
    assert second.home_score == 1
