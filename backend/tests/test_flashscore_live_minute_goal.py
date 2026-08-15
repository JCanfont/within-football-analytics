from types import SimpleNamespace

from app.schemas.api import FlashscoreMatchRead
from app.services import flashscore_provider
from app.services import flashscore_watch


def _settings(api_key: str | None = "rapid-key"):
    return SimpleNamespace(rapidapi_key=api_key, flashscore_api_host="flashscore4.p.rapidapi.com")


# --- Live minute: base + added time (45+X / 90+X) ------------------------------------------------

def test_parse_minute_with_extra_keeps_added_time() -> None:
    assert flashscore_provider._parse_minute_with_extra("23'") == (23, None)
    assert flashscore_provider._parse_minute_with_extra("45+2'") == (45, 2)
    assert flashscore_provider._parse_minute_with_extra("90+4") == (90, 4)
    assert flashscore_provider._parse_minute_with_extra(67) == (67, None)
    # Kickoff clocks / timestamps are not live minutes.
    assert flashscore_provider._parse_minute_with_extra("20:00") == (None, None)
    assert flashscore_provider._parse_minute_with_extra("2026-08-08T20:00:00Z") == (None, None)


def test_collect_matches_preserves_added_time() -> None:
    schedule = [{
        "match_id": "m-1",
        "home_team": {"name": "A"},
        "away_team": {"name": "B"},
        "match_status": "1st half",
        "live_time": "45+2'",
        "scores": {"home": 1, "away": 0},
    }]
    matches = flashscore_provider._parse_matches(schedule)
    assert len(matches) == 1
    assert matches[0].minute == 45
    assert matches[0].minute_extra == 2


def test_live_board_merge_refreshes_minute_and_added_time() -> None:
    watch = [FlashscoreMatchRead(
        event_id="m-1", competition="EN: PL", home_team="A", away_team="B",
        status="1st half", minute=12, favorite_side="home", favorite_team="A", favorite_odds=1.4,
    )]
    board = [FlashscoreMatchRead(
        event_id="m-1", competition="EN: PL", home_team="A", away_team="B",
        status="1st half", minute=45, minute_extra=3, home_score=1, away_score=0,
    )]
    merged = flashscore_watch.merge_flashscore_live_board(watch, board)
    assert merged[0].minute == 45
    assert merged[0].minute_extra == 3


# --- First goal minute extraction from the Flashscore summary timeline ---------------------------

def _summary_with_goals(*incidents: dict) -> dict:
    return {"code": 200, "data": {"incidents": list(incidents)}}


def test_extract_goal_minutes_reads_action_field_and_order() -> None:
    payload = _summary_with_goals(
        {"type": "period_score", "period": "1st Half", "minute": None, "action": "Period score", "score_at": "1 - 0"},
        {"type": "incident", "action": "Goal", "minute": "31'", "score_at": "1 - 0"},
        {"type": "incident", "action": "Yellow card", "minute": "40'"},
        {"type": "incident", "action": "Own Goal", "minute": "5'", "score_at": "1 - 1"},
    )
    # Ordered as they appear; period score is ignored, card ignored, goals kept (incl. own goal).
    assert flashscore_provider._extract_goal_minutes(payload) == [31, 5]


def test_extract_goal_minutes_excludes_disallowed_goals() -> None:
    payload = _summary_with_goals(
        {"type": "incident", "action": "Goal disallowed", "minute": "12'"},
        {"type": "incident", "action": "Goal", "minute": "67'"},
    )
    assert flashscore_provider._extract_goal_minutes(payload) == [67]


def test_extract_goal_minutes_empty_for_goalless_summary() -> None:
    payload = _summary_with_goals(
        {"type": "incident", "action": "Yellow card", "minute": "22'"},
    )
    assert flashscore_provider._extract_goal_minutes(payload) == []


def test_enrich_sets_first_goal_minute_and_classification(monkeypatch) -> None:
    match = FlashscoreMatchRead(
        event_id="m-9", competition="EN: PL", home_team="A", away_team="B",
        status="2nd half", minute=70, home_score=1, away_score=0,
        favorite_side="home", favorite_team="A", favorite_odds=1.4,
    )

    def fake_get_json(url, headers, params):
        if url.endswith("/summary"):
            return _summary_with_goals({"type": "incident", "action": "Goal", "minute": "67'", "score_at": "1 - 0"})
        raise flashscore_provider.requests.RequestException("no commentary")

    monkeypatch.setattr(flashscore_provider, "_get_json", fake_get_json)

    updated = flashscore_provider.enrich_matches_with_goal_minutes([match], settings=_settings())[0]
    assert updated.first_goal_minute == 67
    assert updated.goal_under_30 is False

    # Once captured, it is not looked up again (stickiness / no needless refetch).
    def boom(url, headers, params):
        raise AssertionError("should not refetch once first_goal_minute is set")

    monkeypatch.setattr(flashscore_provider, "_get_json", boom)
    again = flashscore_provider.enrich_matches_with_goal_minutes([updated], settings=_settings())[0]
    assert again.first_goal_minute == 67


def test_enrich_marks_goal_under_30_green_case(monkeypatch) -> None:
    match = FlashscoreMatchRead(
        event_id="m-5", competition="EN: PL", home_team="A", away_team="B",
        status="1st half", minute=30, home_score=1, away_score=0,
        favorite_side="home", favorite_team="A", favorite_odds=1.4,
    )
    monkeypatch.setattr(
        flashscore_provider,
        "_get_json",
        lambda url, headers, params: _summary_with_goals({"type": "incident", "action": "Goal", "minute": "5'"}),
    )
    updated = flashscore_provider.enrich_matches_with_goal_minutes([match], settings=_settings())[0]
    assert updated.first_goal_minute == 5
    assert updated.goal_under_30 is True


# --- first_goal_minute is sticky and never inferred from the scoreline ---------------------------

def test_with_early_goal_flags_keeps_first_goal_minute_sticky() -> None:
    detected = FlashscoreMatchRead(
        event_id="m-1", competition="EN: PL", home_team="A", away_team="B",
        status="2nd half", minute=70, home_score=1, away_score=0,
        favorite_side="home", favorite_team="A", favorite_odds=1.4,
        first_goal_minute=31,
    )
    later = flashscore_watch.with_early_goal_flags(detected.model_copy(update={"minute": 85}))
    assert later.first_goal_minute == 31
    assert later.goal_under_30 is False


def test_with_early_goal_flags_does_not_invent_first_goal_from_score() -> None:
    match = FlashscoreMatchRead(
        event_id="m-2", competition="EN: PL", home_team="A", away_team="B",
        status="1st half", minute=20, home_score=1, away_score=0,
        favorite_side="home", favorite_team="A", favorite_odds=1.4,
    )
    flagged = flashscore_watch.with_early_goal_flags(match)
    # There is a goal on the board, but no timeline yet → first_goal_minute stays unknown.
    assert flagged.first_goal_minute is None
    assert flagged.goal_under_30 is False
