from __future__ import annotations

import argparse
import csv
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
IMPORT_DIR = ROOT / "data" / "imports"
CRAWLORA_BASE_URL = "https://api.crawlora.net/api/v1"

DEFAULT_TOURNAMENTS = {
    925: ("Liga Nacional", "Honduras"),
    358: ("South African Premier Division", "South Africa"),
}

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


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import Honduras and South Africa from SofaScore through Crawlora free SofaScore endpoints.",
    )
    parser.add_argument("--api-key", default=os.getenv("CRAWLORA_API_KEY"), help="Crawlora API key. Defaults to CRAWLORA_API_KEY.")
    parser.add_argument("--seasons", type=int, default=3, help="Number of latest seasons to collect per tournament.")
    parser.add_argument("--team-pages", type=int, default=10, help="Last-event pages to read per team and season.")
    parser.add_argument("--sleep", type=float, default=12.0, help="Seconds between calls. Free Crawlora is 5 requests/min.")
    parser.add_argument("--import-db", action="store_true", help="Import generated CSVs into the local database.")
    parser.add_argument("--with-standings", action="store_true", help="Also import standings snapshots.")
    args = parser.parse_args()

    if not args.api_key:
        raise SystemExit("Missing Crawlora API key. Create a free key and set CRAWLORA_API_KEY.")

    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    result_rows: list[dict[str, str]] = []
    standing_rows: list[dict[str, str]] = []
    seen_event_ids: set[int] = set()

    for tournament_id, (fallback_competition, fallback_country) in DEFAULT_TOURNAMENTS.items():
        seasons = crawlora_get("sofascore/tournament-seasons", args.api_key, id=tournament_id).get("data", {}).get("seasons", [])
        for season in seasons[: args.seasons]:
            season_id = str(season["id"])
            season_label = format_season(season.get("year") or season.get("name"))
            standings_payload = crawlora_get("sofascore/standings", args.api_key, id=tournament_id, season=season_id, type="total")
            groups = standings_payload.get("data", {}).get("groups", [])
            rows = [row for group in groups for row in group.get("rows", [])]
            if not rows:
                continue
            competition = clean_text(groups[0].get("name") or fallback_competition)
            country = fallback_country
            standing_rows.extend(convert_standings(competition, country, season_label, rows))
            team_ids = [row.get("team", {}).get("id") for row in rows if row.get("team", {}).get("id")]
            print(f"tournament={tournament_id} season={season_label} teams={len(team_ids)}")
            time.sleep(args.sleep)

            for team_id in team_ids:
                for page in range(args.team_pages):
                    payload = crawlora_get("sofascore/team-events", args.api_key, id=team_id, direction="last", page=page)
                    data = payload.get("data", {})
                    events = data.get("events", [])
                    for event in events:
                        if not is_target_event(event, tournament_id, seen_event_ids):
                            continue
                        row = convert_event(event, competition, country, season_label)
                        if row:
                            result_rows.append(row)
                            seen_event_ids.add(int(event["id"]))
                    if not data.get("has_next_page"):
                        break
                    time.sleep(args.sleep)

    result_rows.sort(key=lambda row: (row["country"], row["competition"], row["season"], row["match_date"], row["home_team"]))
    results_path = IMPORT_DIR / "sofascore-honduras-south-africa-results.csv"
    standings_path = IMPORT_DIR / "sofascore-honduras-south-africa-standings.csv"
    write_csv(results_path, RESULTS_HEADERS, result_rows)
    write_csv(standings_path, STANDINGS_HEADERS, standing_rows)
    print(f"results={len(result_rows)} -> {results_path}")
    print(f"standings={len(standing_rows)} -> {standings_path}")

    if args.import_db:
        import_into_database(results_path, standings_path if args.with_standings else None)


def crawlora_get(endpoint: str, api_key: str, **params: Any) -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{CRAWLORA_BASE_URL}/{endpoint}?{query}",
        headers={"x-api-key": api_key, "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if int(payload.get("code") or 200) >= 400:
        raise RuntimeError(payload.get("msg") or f"Crawlora request failed: {endpoint}")
    return payload


def convert_standings(competition: str, country: str, season: str, rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    now = datetime.now(UTC).isoformat()
    converted = []
    for row in rows:
        team = row.get("team", {})
        goals_for = int_or_zero(row.get("scores_for"))
        goals_against = int_or_zero(row.get("scores_against"))
        converted.append(
            {
                "competition": competition,
                "season": season,
                "country": country,
                "team": clean_text(team.get("name")),
                "matchday": str(int_or_zero(row.get("matches"))),
                "snapshot_date": now,
                "position": str(int_or_zero(row.get("position"))),
                "played": str(int_or_zero(row.get("matches"))),
                "won": str(int_or_zero(row.get("wins"))),
                "drawn": str(int_or_zero(row.get("draws"))),
                "lost": str(int_or_zero(row.get("losses"))),
                "goals_for": str(goals_for),
                "goals_against": str(goals_against),
                "goal_difference": str(goals_for - goals_against),
                "points": str(int_or_zero(row.get("points"))),
            }
        )
    return converted


def is_target_event(event: dict[str, Any], tournament_id: int, seen_event_ids: set[int]) -> bool:
    event_id = int_or_none(event.get("id"))
    if event_id is None or event_id in seen_event_ids:
        return False
    tournament = event.get("tournament") or {}
    return int_or_none(tournament.get("unique_tournament_id")) == tournament_id


def convert_event(event: dict[str, Any], competition: str, country: str, season: str) -> dict[str, str] | None:
    home = event.get("home_team") or {}
    away = event.get("away_team") or {}
    if not home.get("name") or not away.get("name"):
        return None
    match_date = event_datetime(event)
    home_score = event.get("home_score") or {}
    away_score = event.get("away_score") or {}
    event_id = str(event["id"])
    return {
        "competition": competition,
        "season": season,
        "country": country,
        "competition_type": "domestic_league",
        "matchday": "",
        "match_date": match_date.isoformat(),
        "home_team": clean_text(home.get("name")),
        "away_team": clean_text(away.get("name")),
        "stadium": clean_text((event.get("venue") or {}).get("name")),
        "city": clean_text((event.get("venue") or {}).get("city")),
        "home_score": optional_score(home_score.get("current")),
        "away_score": optional_score(away_score.get("current")),
        "status": normalize_status((event.get("status") or {}).get("type")),
        "is_friendly": "false",
        "source": "sofascore",
        "external_id": f"sofascore-{event_id}",
    }


def write_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def import_into_database(results_path: Path, standings_path: Path | None) -> None:
    import sys

    sys.path.insert(0, str(ROOT / "backend"))
    from app.database import SessionLocal
    from app.services.csv_imports import import_results_csv, import_standings_csv

    db = SessionLocal()
    try:
        results = import_results_csv(db, results_path.read_bytes())
        print(f"imported_results created={results.created} updated={results.updated} skipped={results.skipped} errors={len(results.errors)}")
        if standings_path:
            standings = import_standings_csv(db, standings_path.read_bytes())
            print(f"imported_standings created={standings.created} updated={standings.updated} skipped={standings.skipped} errors={len(standings.errors)}")
    finally:
        db.close()


def event_datetime(event: dict[str, Any]) -> datetime:
    if event.get("start_time"):
        value = str(event["start_time"]).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    timestamp = int_or_none(event.get("start_timestamp"))
    if timestamp is not None:
        return datetime.fromtimestamp(timestamp, tz=UTC)
    return datetime.now(UTC)


def normalize_status(value: Any) -> str:
    status = clean_text(value).lower().replace(" ", "_")
    if status in {"finished", "ended", "after_penalties"}:
        return "finished"
    if status in {"notstarted", "not_started", "scheduled"}:
        return "scheduled"
    if status in {"inprogress", "in_progress", "live"}:
        return "live"
    return status or "scheduled"


def format_season(value: Any) -> str:
    text = clean_text(value)
    if "/" in text and len(text.split("/", 1)[0]) == 2:
        first, second = text.split("/", 1)
        return f"20{first}/20{second}"
    return text


def optional_score(value: Any) -> str:
    parsed = int_or_none(value)
    return "" if parsed is None else str(parsed)


def int_or_zero(value: Any) -> int:
    return int_or_none(value) or 0


def int_or_none(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(str(value)))
    except ValueError:
        return None


def clean_text(value: Any) -> str:
    return str(value or "").strip()


if __name__ == "__main__":
    main()
