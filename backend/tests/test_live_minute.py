from datetime import UTC, datetime, timedelta

from app.services.sofascore_crawlora_provider import compute_live_minute


NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _kickoff(minutes_ago: float) -> int:
    return int((NOW - timedelta(minutes=minutes_ago)).timestamp())


def test_first_half_minute_advances_with_wall_clock() -> None:
    assert compute_live_minute("inprogress", "1st half", _kickoff(23), NOW) == (23, None)


def test_first_half_added_time_is_preserved() -> None:
    # 47 minutes into the first half → 45+2.
    assert compute_live_minute("inprogress", "1st half", _kickoff(47), NOW) == (45, 2)


def test_halftime_shows_forty_five() -> None:
    assert compute_live_minute("inprogress", "Halftime", _kickoff(48), NOW) == (45, None)


def test_second_half_minute_accounts_for_the_break() -> None:
    # 82 wall-clock minutes − 15 break = minute 67.
    assert compute_live_minute("inprogress", "2nd half", _kickoff(82), NOW) == (67, None)


def test_second_half_added_time_is_preserved() -> None:
    # 109 wall-clock minutes − 15 break = minute 94 → 90+4.
    assert compute_live_minute("inprogress", "2nd half", _kickoff(109), NOW) == (90, 4)


def test_not_started_and_finished_have_no_live_minute() -> None:
    assert compute_live_minute("notstarted", "Not started", _kickoff(-5), NOW) == (None, None)
    assert compute_live_minute("finished", "Ended", _kickoff(120), NOW) == (None, None)


def test_missing_kickoff_returns_no_minute() -> None:
    assert compute_live_minute("inprogress", "1st half", None, NOW) == (None, None)
