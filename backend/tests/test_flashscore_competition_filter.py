from app.schemas.api import FlashscoreMatchRead
from app.services.flashscore_competition_filter import is_watchable_competition


def match(competition: str, home: str = "Home", away: str = "Away") -> FlashscoreMatchRead:
    return FlashscoreMatchRead(
        event_id="x",
        competition=competition,
        home_team=home,
        away_team=away,
        status="scheduled",
        favorite_odds=1.4,
        favorite_team=home,
        favorite_side="home",
    )


def test_rejects_norway_third_and_second_named_divisions() -> None:
    assert is_watchable_competition(match("NORWAY: Eliteserien")) is True
    assert is_watchable_competition(match("NORWAY: OBOS-ligaen")) is True
    assert is_watchable_competition(match("NORWAY: Division 2 - Group 1")) is False
    assert is_watchable_competition(match("NORWAY: Division 3 - Group 5")) is False
    assert is_watchable_competition(match("NORWAY: 2. Divisjon")) is False


def test_rejects_poland_third_and_women_competitions() -> None:
    assert is_watchable_competition(match("POLAND: Ekstraklasa")) is True
    assert is_watchable_competition(match("POLAND: Division 1")) is True
    assert is_watchable_competition(match("POLAND: Division 2")) is False
    assert is_watchable_competition(match("POLAND: III Liga - Group II")) is False
    assert is_watchable_competition(match("POLAND: Ekstraliga Women")) is False
    assert is_watchable_competition(match("NORWAY: Toppserien Women")) is False
    assert is_watchable_competition(match("EUROPE: Champions League Women - Placement matches")) is False
    assert is_watchable_competition(match("JAPAN: J1 League", home="Gintra W", away="Riga FC W")) is False


def test_allows_third_tier_only_for_spain_england_portugal() -> None:
    assert is_watchable_competition(match("ENGLAND: League One")) is True
    assert is_watchable_competition(match("ENGLAND: League Two")) is False
    assert is_watchable_competition(match("ENGLAND: National League")) is False
    assert is_watchable_competition(match("SPAIN: Primera Federacion")) is True
    assert is_watchable_competition(match("SPAIN: Segunda Federacion")) is False
    assert is_watchable_competition(match("PORTUGAL: Liga 3")) is True
    assert is_watchable_competition(match("SCOTLAND: League One")) is False
    assert is_watchable_competition(match("GERMANY: 2. Bundesliga")) is True
    assert is_watchable_competition(match("GERMANY: 3. Liga")) is False
    assert is_watchable_competition(match("POLAND: III Liga")) is False
    assert is_watchable_competition(match("FINLAND: Kakkonen")) is False


def test_rejects_all_under_20_sides() -> None:
    assert is_watchable_competition(match("BRAZIL: Serie A", home="Palmeiras U20")) is False
    assert is_watchable_competition(match("WORLD: Under 20 Championship")) is False
    assert is_watchable_competition(match("ARGENTINA: Reserva")) is False
    assert is_watchable_competition(match("ENGLAND: Premier League", home="Arsenal U20", away="Chelsea U20")) is False


def test_keeps_top_cups_and_international() -> None:
    assert is_watchable_competition(match("ENGLAND: EFL Cup")) is True
    assert is_watchable_competition(match("EUROPE: Champions League")) is True
    assert is_watchable_competition(match("ASIA: ASEAN Championship")) is True
    assert is_watchable_competition(match("LaLiga")) is True
    assert is_watchable_competition(match("Premier League")) is True
