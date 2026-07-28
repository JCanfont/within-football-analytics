from __future__ import annotations

import argparse
import csv
import json
import os
import time
import unicodedata
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
IMPORT_DIR = ROOT / "data" / "imports"
API_BASE_URL = "https://api.football-data-api.com"
DEFAULT_TARGETS = (
    ("Honduras", "Liga Nacional de Futbol Profesional de Honduras"),
    ("South Africa", "Premier Soccer League"),
)

RESULTS_HEADERS = [
    "competition",
    "season",
    "country",
    "competition_type",
    "matchday",
    "match_date",
    "home_team",
    "away_team",
    "stadium",
    "city",
    "home_score",
    "away_score",
    "status",
    "is_friendly",
    "source",
    "external_id",
]

STANDINGS_HEADERS = [
    "competition",
    "season",
    "country",
    "team",
    "matchday",
    "snapshot_date",
    "position",
    "played",
    "won",
    "drawn",
    "lost",
    "goals_for",
    "goals_against",
    "goal_difference",
    "points",
]

GOAL_MOMENTS_HEADERS = [
    "match_source",
    "match_external_id",
    "team",
    "minute",
    "period",
]


@dataclass
class TeamStanding:
    played: int = 0
    won: int = 0
    drawn: int = 0
    lost: int = 0
    goals_for: int = 0
    goals_against: int = 0
    points: int = 0

    @property
    def goal_difference(self) -> int:
        return self.goals_for - self.goals_against


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download FootyStats seasons and convert Honduras/South Africa into WITHIN import CSVs.",
    )
    parser.add_argument("--api-key", default=os.getenv("FOOTYSTATS_API_KEY"), help="FootyStats API key. Defaults to FOOTYSTATS_API_KEY.")
    parser.add_argument("--seasons", type=int, default=3, help="Finished/current seasons with useful matches to export per league.")
    parser.add_argument("--import-db", action="store_true", help="Import generated CSV files into the configured local database.")
    parser.add_argument("--with-standings", action="store_true", help="Also import generated standings snapshots.")
    parser.add_argument("--targets", nargs="*", help="Optional targets as Country:League Name.")
    parser.add_argument("--sleep", type=float, default=0.25, help="Seconds to wait between API calls.")
    args = parser.parse_args()

    if not args.api_key:
        raise SystemExit(
            "Missing FootyStats API key. Set FOOTYSTATS_API_KEY or pass --api-key. "
            "The public Football-Data CSV feed does not include Honduras or South Africa."
        )

    targets = parse_targets(args.targets) if args.targets else list(DEFAULT_TARGETS)
    IMPORT_DIR.mkdir(parents=True, exist_ok=True)

    league_list = api_get("league-list", args.api_key).get("data", [])
    all_results: list[dict[str, str]] = []
    all_standings: list[dict[str, str]] = []
    all_goal_moments: list[dict[str, str]] = []

    for country, league_name in targets:
        league = find_league(league_list, country, league_name)
        selected = load_latest_useful_seasons(league, args.api_key, args.seasons, args.sleep)
        if not selected:
            print(f"warning=no useful seasons found country={country} league={league_name}")
            continue
        for season_item, matches in selected:
            competition = clean_text(league.get("league_name") or league.get("name") or league_name)
            country_name = clean_text(league.get("country") or country)
            season = format_season(season_item.get("year") or matches[0].get("season"))
            converted = convert_matches(country_name, competition, season, matches)
            all_results.extend(converted[0])
            all_goal_moments.extend(converted[1])
            all_standings.extend(build_standings(country_name, competition, season, converted[0]))
            print(f"league={country_name} {competition} season={season} matches={len(converted[0])} goals={len(converted[1])}")

    results_path = IMPORT_DIR / "footystats-honduras-south-africa-results.csv"
    standings_path = IMPORT_DIR / "footystats-honduras-south-africa-standings.csv"
    goal_moments_path = IMPORT_DIR / "footystats-honduras-south-africa-goal-moments.csv"
    write_csv(results_path, RESULTS_HEADERS, all_results)
    write_csv(standings_path, STANDINGS_HEADERS, all_standings)
    write_csv(goal_moments_path, GOAL_MOMENTS_HEADERS, all_goal_moments)
    print(f"results={len(all_results)} -> {results_path}")
    print(f"standings={len(all_standings)} -> {standings_path}")
    print(f"goal_moments={len(all_goal_moments)} -> {goal_moments_path}")

    if args.import_db:
        import_into_database(results_path, standings_path if args.with_standings else None, goal_moments_path)


def parse_targets(values: list[str]) -> list[tuple[str, str]]:
    targets: list[tuple[str, str]] = []
    for value in values:
        if ":" not in value:
            raise ValueError(f"Target must use Country:League Name format: {value}")
        country, league = value.split(":", 1)
        targets.append((country.strip(), league.strip()))
    return targets


def api_get(endpoint: str, api_key: str, **params: Any) -> dict[str, Any]:
    query = urllib.parse.urlencode({"key": api_key, **{key: value for key, value in params.items() if value is not None}})
    url = f"{API_BASE_URL}/{endpoint}?{query}"
    with urllib.request.urlopen(url, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if payload.get("success") is False:
        raise RuntimeError(payload.get("message") or f"FootyStats request failed: {endpoint}")
    return payload


def find_league(leagues: list[dict[str, Any]], country: str, league_name: str) -> dict[str, Any]:
    country_key = normalize(country)
    league_key = normalize(league_name)
    country_matches = [league for league in leagues if normalize(league.get("country")) == country_key]
    exact = [
        league
        for league in country_matches
        if league_key in {normalize(league.get("league_name")), normalize(league.get("name"))}
        or league_key in normalize(league.get("name"))
        or league_key in normalize(league.get("league_name"))
    ]
    if exact:
        return exact[0]
    options = ", ".join(sorted(clean_text(item.get("league_name") or item.get("name")) for item in country_matches)[:12])
    raise ValueError(f"Could not find FootyStats league {country}:{league_name}. Available country options: {options}")


def load_latest_useful_seasons(
    league: dict[str, Any],
    api_key: str,
    limit: int,
    sleep_seconds: float,
) -> list[tuple[dict[str, Any], list[dict[str, Any]]]]:
    seasons = sorted(league.get("season") or [], key=lambda item: season_sort_key(item.get("year")), reverse=True)
    selected: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []
    for season in seasons:
        if len(selected) >= limit:
            break
        league_id = season.get("id")
        if not league_id:
            continue
        matches = fetch_league_matches(api_key, int(league_id))
        useful = [match for match in matches if has_teams(match)]
        if useful:
            selected.append((season, useful))
        time.sleep(sleep_seconds)
    return selected


def fetch_league_matches(api_key: str, league_id: int) -> list[dict[str, Any]]:
    first = api_get("league-matches", api_key, league_id=league_id)
    matches = list(first.get("data") or [])
    pager = first.get("pager") or {}
    max_page = int(pager.get("max_page") or 1)
    for page in range(2, max_page + 1):
        payload = api_get("league-matches", api_key, league_id=league_id, page=page)
        matches.extend(payload.get("data") or [])
    return matches


def convert_matches(
    country: str,
    competition: str,
    season: str,
    matches: list[dict[str, Any]],
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    result_rows: list[dict[str, str]] = []
    goal_rows: list[dict[str, str]] = []
    sorted_matches = sorted(matches, key=lambda match: (match_datetime(match), int_or_none(match.get("id")) or 0))

    for index, match in enumerate(sorted_matches, start=1):
        home = clean_text(pick(match, "home_name", "homeName", "home_team", "team_a_name"))
        away = clean_text(pick(match, "away_name", "awayName", "away_team", "team_b_name"))
        if not home or not away:
            continue
        home_score = int_or_none(pick(match, "homeGoalCount", "homeGoalsCount", "home_score", "team_a_score"))
        away_score = int_or_none(pick(match, "awayGoalCount", "awayGoalsCount", "away_score", "team_b_score"))
        status = normalize_status(pick(match, "status"))
        match_id = str(pick(match, "id") or make_external_id(competition, season, home, away, match_datetime(match).isoformat()))
        external_id = f"footystats-{match_id}"
        result_rows.append(
            {
                "competition": competition,
                "season": season,
                "country": country,
                "competition_type": "domestic_league",
                "matchday": str(int_or_none(pick(match, "game_week", "revised_game_week", "roundID")) or index),
                "match_date": match_datetime(match).isoformat(),
                "home_team": home,
                "away_team": away,
                "stadium": clean_text(pick(match, "stadium_name")),
                "city": clean_text(pick(match, "stadium_location")),
                "home_score": "" if home_score is None else str(home_score),
                "away_score": "" if away_score is None else str(away_score),
                "status": status,
                "is_friendly": "false",
                "source": "footystats",
                "external_id": external_id,
            }
        )
        goal_rows.extend(goal_moment_rows(external_id, home, pick(match, "homeGoals_timings", "homeGoals"), "first_unknown"))
        goal_rows.extend(goal_moment_rows(external_id, away, pick(match, "awayGoals_timings", "awayGoals"), "first_unknown"))

    return result_rows, goal_rows


def build_standings(country: str, competition: str, season: str, matches: list[dict[str, str]]) -> list[dict[str, str]]:
    finished = [
        match
        for match in matches
        if match["status"] == "finished" and match["home_score"] != "" and match["away_score"] != ""
    ]
    teams = sorted({match["home_team"] for match in finished} | {match["away_team"] for match in finished})
    table = {team: TeamStanding() for team in teams}
    rows: list[dict[str, str]] = []
    current_matchday: int | None = None
    for match in sorted(finished, key=lambda item: (int(item["matchday"]), item["match_date"], item["home_team"], item["away_team"])):
        matchday = int(match["matchday"])
        if current_matchday is None or matchday != current_matchday:
            snapshot_date = datetime.fromisoformat(match["match_date"]) - timedelta(minutes=1)
            rows.extend(build_standing_snapshot(country, competition, season, matchday, snapshot_date, table))
            current_matchday = matchday
        apply_result(table[match["home_team"]], table[match["away_team"]], int(match["home_score"]), int(match["away_score"]))
    return rows


def build_standing_snapshot(
    country: str,
    competition: str,
    season: str,
    matchday: int,
    snapshot_date: datetime,
    table: dict[str, TeamStanding],
) -> list[dict[str, str]]:
    ranked = sorted(table.items(), key=lambda item: (-item[1].points, -item[1].goal_difference, -item[1].goals_for, item[0]))
    return [
        {
            "competition": competition,
            "season": season,
            "country": country,
            "team": team,
            "matchday": str(matchday),
            "snapshot_date": snapshot_date.isoformat(),
            "position": str(position),
            "played": str(standing.played),
            "won": str(standing.won),
            "drawn": str(standing.drawn),
            "lost": str(standing.lost),
            "goals_for": str(standing.goals_for),
            "goals_against": str(standing.goals_against),
            "goal_difference": str(standing.goal_difference),
            "points": str(standing.points),
        }
        for position, (team, standing) in enumerate(ranked, start=1)
    ]


def apply_result(home: TeamStanding, away: TeamStanding, home_score: int, away_score: int) -> None:
    home.played += 1
    away.played += 1
    home.goals_for += home_score
    home.goals_against += away_score
    away.goals_for += away_score
    away.goals_against += home_score
    if home_score > away_score:
        home.won += 1
        away.lost += 1
        home.points += 3
    elif away_score > home_score:
        away.won += 1
        home.lost += 1
        away.points += 3
    else:
        home.drawn += 1
        away.drawn += 1
        home.points += 1
        away.points += 1


def goal_moment_rows(external_id: str, team: str, values: Any, default_period: str) -> list[dict[str, str]]:
    if not isinstance(values, list):
        return []
    rows = []
    for value in values:
        minute = parse_goal_minute(value)
        if minute is None:
            continue
        rows.append(
            {
                "match_source": "footystats",
                "match_external_id": external_id,
                "team": team,
                "minute": str(minute),
                "period": period_for_minute(minute) if default_period == "first_unknown" else default_period,
            }
        )
    return rows


def write_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def import_into_database(results_path: Path, standings_path: Path | None, goal_moments_path: Path) -> None:
    import sys

    sys.path.insert(0, str(ROOT / "backend"))
    from app.database import SessionLocal
    from app.services.csv_imports import import_goal_moments_csv, import_results_csv, import_standings_csv

    db = SessionLocal()
    try:
        results = import_results_csv(db, results_path.read_bytes())
        print(f"imported_results created={results.created} updated={results.updated} skipped={results.skipped} errors={len(results.errors)}")
        if standings_path:
            standings = import_standings_csv(db, standings_path.read_bytes())
            print(f"imported_standings created={standings.created} updated={standings.updated} skipped={standings.skipped} errors={len(standings.errors)}")
        goal_moments = import_goal_moments_csv(db, goal_moments_path.read_bytes())
        print(f"imported_goal_moments created={goal_moments.created} skipped={goal_moments.skipped} errors={len(goal_moments.errors)}")
    finally:
        db.close()


def has_teams(match: dict[str, Any]) -> bool:
    return bool(pick(match, "home_name", "homeName", "home_team", "team_a_name")) and bool(
        pick(match, "away_name", "awayName", "away_team", "team_b_name")
    )


def pick(item: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return value
    return None


def match_datetime(match: dict[str, Any]) -> datetime:
    unix_value = int_or_none(pick(match, "date_unix", "dateUnix"))
    if unix_value is not None:
        return datetime.fromtimestamp(unix_value, tz=UTC)
    value = pick(match, "date", "match_date", "matchDate")
    if isinstance(value, str) and value:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed
    return datetime.now(UTC)


def normalize_status(value: Any) -> str:
    normalized = normalize(value)
    if normalized in {"complete", "finished", "ft", "final"}:
        return "finished"
    if normalized in {"incomplete", "scheduled", "not_started", "notstarted", "pending"}:
        return "scheduled"
    if "live" in normalized or "minute" in normalized or "half" in normalized:
        return "live"
    return normalized or "scheduled"


def parse_goal_minute(value: Any) -> int | None:
    text = str(value).strip()
    if not text:
        return None
    text = text.split("+", 1)[0]
    try:
        return int(float(text))
    except ValueError:
        return None


def period_for_minute(minute: int) -> str:
    return "first_half" if minute <= 45 else "second_half"


def format_season(value: Any) -> str:
    text = str(value or "").strip()
    if len(text) == 8 and text.isdigit():
        return f"{text[:4]}/{text[4:]}"
    if len(text) == 4 and text.isdigit():
        return text
    return text


def season_sort_key(value: Any) -> int:
    text = str(value or "0").strip()
    if text.isdigit():
        return int(text)
    return 0


def int_or_none(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(str(value)))
    except ValueError:
        return None


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def normalize(value: Any) -> str:
    text = clean_text(value).casefold()
    text = "".join(
        character
        for character in unicodedata.normalize("NFKD", text)
        if not unicodedata.combining(character)
    )
    return " ".join(text.replace("-", " ").replace("_", " ").split())


def make_external_id(*parts: str) -> str:
    raw = "-".join(parts)
    return "".join(character.lower() if character.isalnum() else "-" for character in raw).strip("-")


if __name__ == "__main__":
    main()
