"""Flashscore competition eligibility for the ≤1.60 watchlist.

Rules:
- Drop friendlies, women, reserves and all Under-20 / youth sides.
- Keep only top-2 domestic divisions by default.
- Spain, England and Portugal may also keep the 3rd division.
- Keep major international competitions and main domestic cups.
"""

from __future__ import annotations

import re
from typing import Iterable

from app.schemas.api import FlashscoreMatchRead

# Below 2nd division is out, except these countries may keep tier 3.
DEEP_COUNTRIES = {
    "spain",
    "espana",
    "españa",
    "england",
    "portugal",
}

ALWAYS_REJECT_TOKENS = (
    "friendly",
    "amistoso",
    "women",
    "femen",
    "womens",
    "women's",
    "u15",
    "u16",
    "u17",
    "u18",
    "u19",
    "u20",
    "u21",
    "u23",
    "under 20",
    "under-20",
    "under20",
    "sub-20",
    "sub 20",
    "sub20",
    "youth",
    "reserve",
    "reserva",
    "junior",
    "next pro",
    "mls next",
)

INTERNATIONAL_ALLOW = (
    "champions league",
    "europa league",
    "conference league",
    "uefa",
    "world cup",
    "nations league",
    "copa libertadores",
    "copa sudamericana",
    "afc champions",
    "caf champions",
    "concacaf",
    "asean championship",
    "club world",
)

# Country -> ordered list of (substring, tier). First match wins.
COUNTRY_TIER_RULES: dict[str, tuple[tuple[str, int], ...]] = {
    "norway": (
        ("eliteserien", 1),
        ("obos", 2),
        ("1. divisjon", 2),
        ("first division", 2),
        ("division 1", 2),
        ("2. divisjon", 3),
        ("division 2", 3),
        ("3. divisjon", 4),
        ("division 3", 4),
        ("nm cup", 0),
        ("norwegian cup", 0),
    ),
    "england": (
        ("premier league", 1),
        ("championship", 2),
        ("league one", 3),
        ("league 1", 3),
        ("league two", 4),
        ("league 2", 4),
        ("national league south", 6),
        ("national league north", 6),
        ("national league", 5),
        ("efl cup", 0),
        ("fa cup", 0),
        ("community shield", 0),
        ("premier league cup", 0),
    ),
    "spain": (
        ("laliga2", 2),
        ("la liga 2", 2),
        ("laliga hypermotion", 2),
        ("segunda division", 2),
        ("segunda divisi", 2),
        ("laliga", 1),
        ("la liga", 1),
        ("primera division", 1),
        ("primera federacion", 3),
        ("primera federación", 3),
        ("primera rfef", 3),
        ("segunda federacion", 4),
        ("segunda federación", 4),
        ("segunda rfef", 4),
        ("tercera", 5),
        ("copa del rey", 0),
        ("supercopa", 0),
    ),
    "portugal": (
        ("liga portugal 2", 2),
        ("segunda liga", 2),
        ("liga 2", 2),
        ("liga portugal", 1),
        ("primeira liga", 1),
        ("primeira", 1),
        ("liga 3", 3),
        ("taca de portugal", 0),
        ("taça de portugal", 0),
        ("taca da liga", 0),
        ("supertaca", 0),
    ),
    "netherlands": (
        ("eredivisie", 1),
        ("keuken kampioen", 2),
        ("eerste divisie", 2),
        ("tweede divisie", 3),
        ("knvb beker", 0),
        ("johan cruijff", 0),
    ),
    "germany": (
        ("bundesliga", 1),  # matches 2. bundesliga too if ordered carefully
        ("2. bundesliga", 2),
        ("3. liga", 3),
        ("regionalliga", 4),
        ("dfb pokal", 0),
    ),
    "france": (
        ("ligue 1", 1),
        ("ligue 2", 2),
        ("national 1", 3),
        ("national 2", 4),
        ("coupe de france", 0),
        ("coupe de la ligue", 0),
    ),
    "italy": (
        ("serie a", 1),
        ("serie b", 2),
        ("serie c", 3),
        ("serie d", 4),
        ("coppa italia", 0),
        ("supercoppa", 0),
    ),
    "scotland": (
        ("premiership", 1),
        ("championship", 2),
        ("league one", 3),
        ("league two", 4),
        ("scottish cup", 0),
        ("league cup", 0),
    ),
    "sweden": (
        ("allsvenskan", 1),
        ("superettan", 2),
        ("division 1", 3),
        ("ettan", 3),
        ("division 2", 4),
        ("svenska cupen", 0),
    ),
    "denmark": (
        ("superliga", 1),
        ("1st division", 2),
        ("1. division", 2),
        ("2nd division", 3),
        ("2. division", 3),
        ("3rd division", 4),
        ("3. division", 4),
        ("dbu pokalen", 0),
    ),
    "finland": (
        ("veikkausliiga", 1),
        ("ykkonen", 2),
        ("ykkönen", 2),
        ("kakkonen", 3),
        ("suomen cup", 0),
    ),
    "poland": (
        ("ekstraklasa", 1),
        ("division 1", 2),
        ("i liga", 2),
        ("1. liga", 2),
        ("ii liga", 3),
        ("2. liga", 3),
        ("iii liga", 4),
        ("3. liga", 4),
        ("polish cup", 0),
        ("puchar", 0),
    ),
    "russia": (
        ("premier league", 1),
        ("premier liga", 1),
        ("fnl", 2),
        ("first league", 2),
        ("1. liga", 2),
        ("second league", 3),
        ("2. liga", 3),
        ("russian cup", 0),
    ),
    "brazil": (
        ("serie a", 1),
        ("série a", 1),
        ("serie b", 2),
        ("série b", 2),
        ("serie c", 3),
        ("série c", 3),
        ("serie d", 4),
        ("copa do brasil", 0),
    ),
    "argentina": (
        ("liga profesional", 1),
        ("primera division", 1),
        ("primera nacional", 2),
        ("nacional b", 2),
        ("primera b", 3),
        ("torneo federal", 3),
        ("copa argentina", 0),
        ("copa de la liga", 0),
    ),
    "china": (
        ("super league", 1),
        ("league one", 2),
        ("league 1", 2),
        ("league two", 3),
        ("league 2", 3),
        ("fa cup", 0),
    ),
    "japan": (
        ("j1", 1),
        ("j2", 2),
        ("j3", 3),
        ("emperor", 0),
        ("league cup", 0),
    ),
    "usa": (
        ("mls", 1),
        ("major league soccer", 1),
        ("usl championship", 2),
        ("usl league one", 3),
        ("us open cup", 0),
    ),
    "mexico": (
        ("liga mx", 1),
        ("expansion", 2),
        ("expansión", 2),
        ("copa mx", 0),
    ),
    "turkey": (
        ("super lig", 1),
        ("süper lig", 1),
        ("1. lig", 2),
        ("1lig", 2),
        ("2. lig", 3),
        ("turkish cup", 0),
    ),
    "belgium": (
        ("jupiler", 1),
        ("pro league", 1),
        ("challenger", 2),
        ("first division b", 2),
        ("first division a", 1),
        ("croky cup", 0),
    ),
    "switzerland": (
        ("super league", 1),
        ("challenge league", 2),
        ("promotion league", 3),
        ("swiss cup", 0),
    ),
    "austria": (
        ("bundesliga", 1),
        ("2. liga", 2),
        ("regionalliga", 3),
        ("ofb cup", 0),
    ),
    "romania": (
        ("superliga", 1),
        ("liga 1", 1),
        ("liga 2", 2),
        ("liga ii", 2),
        ("liga 3", 3),
        ("romania cup", 0),
    ),
    "serbia": (
        ("super liga", 1),
        ("prva liga", 2),
        ("first league", 2),
        ("serbia cup", 0),
    ),
    "slovakia": (
        ("nike liga", 1),
        ("fortuna liga", 1),
        ("2. liga", 2),
        ("3. liga", 3),
        ("slovak cup", 0),
    ),
    "hungary": (
        ("nb i", 1),
        ("otp bank liga", 1),
        ("nb ii", 2),
        ("nb iii", 3),
        ("hungarian cup", 0),
    ),
    "czech republic": (
        ("chance liga", 1),
        ("first league", 1),
        ("fnl", 2),
        ("2. liga", 2),
        ("3. liga", 3),
        ("czech cup", 0),
    ),
    "croatia": (
        ("hnl", 1),
        ("1. nl", 1),
        ("prva nl", 1),
        ("1. nl", 1),
        ("2. nl", 2),
        ("druga", 2),
        ("3. nl", 3),
        ("cup", 0),
    ),
    "greece": (
        ("super league 1", 1),
        ("super league", 1),
        ("super league 2", 2),
        ("greek cup", 0),
    ),
    "ukraine": (
        ("premier league", 1),
        ("persha", 2),
        ("first league", 2),
        ("ukrainian cup", 0),
    ),
    "chile": (
        ("primera", 1),
        ("liga de primera", 1),
        ("primera b", 2),
        ("copa chile", 0),
    ),
    "colombia": (
        ("primera a", 1),
        ("liga betplay", 1),
        ("primera b", 2),
        ("copa colombia", 0),
    ),
    "uruguay": (
        ("primera", 1),
        ("segunda", 2),
        ("copa uruguay", 0),
    ),
    "south africa": (
        ("premiership", 1),
        ("psl", 1),
        ("national first", 2),
        ("mtn 8", 0),
        ("nedbank", 0),
    ),
    "kazakhstan": (
        ("premier league", 1),
        ("first division", 2),
        ("kazakhstan cup", 0),
    ),
    "latvia": (
        ("virsliga", 1),
        ("nakotnes", 2),
        ("1. liga", 2),
        ("latvian cup", 0),
    ),
    "lithuania": (
        ("a lyga", 1),
        ("i lyga", 2),
        ("1 lyga", 2),
        ("lithuanian cup", 0),
    ),
    "estonia": (
        ("meistriliiga", 1),
        ("premium liiga", 1),
        ("esiliiga", 2),
        ("estonian cup", 0),
    ),
    "faroe islands": (
        ("premier", 1),
        ("betri", 1),
        ("1. deild", 2),
        ("cup", 0),
    ),
    "northern ireland": (
        ("premiership", 1),
        ("nifl premiership", 1),
        ("championship", 2),
        ("irish cup", 0),
    ),
    "wales": (
        ("cymru premier", 1),
        ("premier", 1),
        ("cymru north", 2),
        ("cymru south", 2),
        ("welsh cup", 0),
    ),
    "india": (
        ("isl", 1),
        ("indian super league", 1),
        ("i-league", 2),
        ("calcutta", 4),
    ),
    "malaysia": (
        ("super league", 1),
        ("premier", 2),
        ("malaysia cup", 0),
    ),
    "malawi": (
        ("super league", 1),
    ),
}

# Apply more specific German 2./3. liga before bare "bundesliga".
COUNTRY_TIER_RULES["germany"] = (
    ("3. liga", 3),
    ("2. bundesliga", 2),
    ("bundesliga", 1),
    ("regionalliga", 4),
    ("dfb pokal", 0),
)

# Bare tournament names (API sometimes omits country).
GLOBAL_LEAGUE_TIERS: dict[str, tuple[str, int]] = {
    "laliga": ("spain", 1),
    "la liga": ("spain", 1),
    "laliga2": ("spain", 2),
    "laliga hypermotion": ("spain", 2),
    "primera federacion": ("spain", 3),
    "primera federación": ("spain", 3),
    "premier league": ("england", 1),
    "championship": ("england", 2),
    "league one": ("england", 3),
    "league two": ("england", 4),
    "efl cup": ("england", 0),
    "fa cup": ("england", 0),
    "liga portugal": ("portugal", 1),
    "liga portugal 2": ("portugal", 2),
    "liga 3": ("portugal", 3),
    "serie a": ("italy", 1),
    "serie b": ("italy", 2),
    "serie c": ("italy", 3),
    "bundesliga": ("germany", 1),
    "2. bundesliga": ("germany", 2),
    "3. liga": ("germany", 3),
    "ligue 1": ("france", 1),
    "ligue 2": ("france", 2),
    "eredivisie": ("netherlands", 1),
    "eliteserien": ("norway", 1),
    "allsvenskan": ("sweden", 1),
    "superettan": ("sweden", 2),
    "ekstraklasa": ("poland", 1),
    "veikkausliiga": ("finland", 1),
    "kakkonen": ("finland", 3),
}

GENERIC_TIER_PATTERNS: tuple[tuple[re.Pattern[str], int], ...] = (
    # Lower domestic tiers — intentionally strict (default deny for unknowns).
    (re.compile(r"\biii\b|\b3\.\s*liga\b|\bdivision\s*3\b|\b3rd\b|\bthird division\b|\btercera\b"), 4),
    (re.compile(r"\b2\.\s*divisjon\b|\bdivision\s*2\b|\b2nd division\b|\bsecond division\b"), 3),
    (re.compile(r"\bii\s*liga\b|\b2\.\s*liga\b"), 3),
    (re.compile(r"\b1\.\s*divisjon\b|\bdivision\s*1\b|\bfirst division\b|\b1\.\s*liga\b|\bi\s*liga\b"), 2),
)


def is_watchable_competition(match: FlashscoreMatchRead) -> bool:
    competition = match.competition or ""
    home = match.home_team or ""
    away = match.away_team or ""
    haystack = f"{competition} {home} {away}".lower()
    if any(token in haystack for token in ALWAYS_REJECT_TOKENS):
        return False
    if _is_under_20(haystack):
        return False

    country, league = _split_competition(competition)
    country_key = _normalize_country(country)
    league_l = league.lower()
    full_l = competition.lower()

    if any(token in full_l for token in INTERNATIONAL_ALLOW):
        return True

    if not country_key:
        inferred = _infer_from_global_name(league_l)
        if inferred is not None:
            country_key, tier = inferred
            if tier == 0:
                return True
            max_tier = 3 if country_key in DEEP_COUNTRIES else 2
            return tier <= max_tier

    tier = _tier_for_country_league(country_key, league_l, full_l)
    if tier is None:
        # Unknown domestic competition: keep only if it clearly looks like a top cup.
        return _looks_like_main_cup(league_l)

    if tier == 0:
        return True  # domestic cup

    max_tier = 3 if country_key in DEEP_COUNTRIES else 2
    return tier <= max_tier


def filter_watchable_matches(matches: Iterable[FlashscoreMatchRead]) -> list[FlashscoreMatchRead]:
    return [match for match in matches if is_watchable_competition(match)]


def _is_under_20(haystack: str) -> bool:
    if any(token in haystack for token in ("u20", "under 20", "under-20", "under20", "sub-20", "sub 20", "sub20")):
        return True
    return bool(re.search(r"\bu-?20\b", haystack))


def _split_competition(competition: str) -> tuple[str, str]:
    if ":" in competition:
        country, league = competition.split(":", 1)
        return country.strip(), league.strip()
    return "", competition.strip()


def _normalize_country(country: str) -> str:
    key = country.strip().lower()
    aliases = {
        "españa": "spain",
        "espana": "spain",
        "england": "england",
        "portugal": "portugal",
        "czech": "czech republic",
        "czechia": "czech republic",
        "bosnia": "bosnia and herzegovina",
        "bosnia & herzegovina": "bosnia and herzegovina",
        "south korea": "south korea",
        "korea republic": "south korea",
        "usa": "usa",
        "united states": "usa",
        "u.s.a": "usa",
        "u.s.a.": "usa",
    }
    return aliases.get(key, key)


def _infer_from_global_name(league_l: str) -> tuple[str, int] | None:
    for needle, (country, tier) in sorted(GLOBAL_LEAGUE_TIERS.items(), key=lambda item: len(item[0]), reverse=True):
        if needle == league_l or needle in league_l:
            return country, tier
    return None


def _tier_for_country_league(country_key: str, league_l: str, full_l: str) -> int | None:
    rules = COUNTRY_TIER_RULES.get(country_key)
    if rules:
        # Longer / more specific needles first; compare lowercased.
        for needle, tier in sorted(rules, key=lambda item: len(item[0]), reverse=True):
            needle_l = needle.lower()
            if needle_l in league_l or needle_l in full_l:
                return tier

    for pattern, tier in GENERIC_TIER_PATTERNS:
        if pattern.search(league_l) or pattern.search(full_l):
            return tier
    return None


def _looks_like_main_cup(league_l: str) -> bool:
    if any(token in league_l for token in ("cup", "copa", "taca", "taça", "pokal", "beker", "shield")):
        # Reject obscure lower-league cups / youth cups already blocked above.
        if any(token in league_l for token in ("amateur", "regional", "junior", "youth", "u20", "reserve")):
            return False
        return True
    return False
