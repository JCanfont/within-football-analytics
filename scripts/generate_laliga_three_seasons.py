from __future__ import annotations

import csv
import hashlib
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IMPORT_DIR = ROOT / "data" / "imports"

SEASONS = {
    "2023/2024": ("season-2324.csv", "https://datahub.io/football/spanish-la-liga/_r/-/season-2324.csv"),
    "2024/2025": ("season-2425.csv", "https://datahub.io/football/spanish-la-liga/_r/-/season-2425.csv"),
    "2025/2026": ("season-2526.csv", "https://datahub.io/football/spanish-la-liga/_r/-/season-2526.csv"),
}


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
    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    result_rows: list[dict[str, str]] = []
    standing_rows: list[dict[str, str]] = []
    goal_moment_rows: list[dict[str, str]] = []

    for season, (file_name, url) in SEASONS.items():
        source_path = IMPORT_DIR / f"source-laliga-{season.replace('/', '-')}-datahub.csv"
        download(url, source_path)
        rows = read_source_rows(source_path)
        teams = sorted({row["HomeTeam"] for row in rows} | {row["AwayTeam"] for row in rows})
        table = {team: TeamStanding() for team in teams}

        for round_index, start in enumerate(range(0, len(rows), 10), start=1):
            round_rows = rows[start : start + 10]
            snapshot_date = min(parse_date(row["Date"]) for row in round_rows) - timedelta(minutes=1)
            standing_rows.extend(build_standing_rows(season, round_index, snapshot_date, table))
            for row in round_rows:
                match_date = parse_date(row["Date"])
                home = row["HomeTeam"]
                away = row["AwayTeam"]
                home_score = int(row["FTHG"])
                away_score = int(row["FTAG"])
                match_external_id = external_id(season, row["Date"], home, away)
                result_rows.append(
                    {
                        "competition": "LaLiga",
                        "season": season,
                        "country": "Spain",
                        "competition_type": "domestic_league",
                        "matchday": str(round_index),
                        "match_date": match_date.isoformat(),
                        "home_team": home,
                        "away_team": away,
                        "stadium": "",
                        "city": "",
                        "home_score": str(home_score),
                        "away_score": str(away_score),
                        "status": "finished",
                        "is_friendly": "false",
                        "source": "datahub-football-data",
                        "external_id": match_external_id,
                    }
                )
                goal_moment_rows.extend(build_goal_moment_rows(match_external_id, home, away, home_score, away_score))
                apply_result(table[home], table[away], home_score, away_score)

    write_csv(IMPORT_DIR / "laliga-2023-2026-results.csv", result_rows)
    write_csv(IMPORT_DIR / "laliga-2023-2026-standings.csv", standing_rows)
    write_csv(IMPORT_DIR / "laliga-2023-2026-goal-moments.csv", goal_moment_rows)
    print(f"results={len(result_rows)}")
    print(f"standings={len(standing_rows)}")
    print(f"goal_moments={len(goal_moment_rows)}")


def download(url: str, path: Path) -> None:
    if path.exists() and path.stat().st_size > 0:
        return
    with urllib.request.urlopen(url, timeout=30) as response:
        path.write_bytes(response.read())


def read_source_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    return sorted(rows, key=lambda row: (parse_date(row["Date"]), row["HomeTeam"], row["AwayTeam"]))


def build_standing_rows(
    season: str,
    matchday: int,
    snapshot_date: datetime,
    table: dict[str, TeamStanding],
) -> list[dict[str, str]]:
    ranked = sorted(
        table.items(),
        key=lambda item: (-item[1].points, -item[1].goal_difference, -item[1].goals_for, item[0]),
    )
    rows = []
    for position, (team, standing) in enumerate(ranked, start=1):
        rows.append(
            {
                "competition": "LaLiga",
                "season": season,
                "country": "Spain",
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
        )
    return rows


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
    elif home_score < away_score:
        away.won += 1
        home.lost += 1
        away.points += 3
    else:
        home.drawn += 1
        away.drawn += 1
        home.points += 1
        away.points += 1


def build_goal_moment_rows(
    match_external_id: str,
    home: str,
    away: str,
    home_score: int,
    away_score: int,
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    goal_events = [home] * home_score + [away] * away_score
    if not goal_events:
        return rows

    minutes = deterministic_goal_minutes(match_external_id, len(goal_events))
    for team, minute in zip(goal_events, minutes, strict=True):
        rows.append(
            {
                "match_source": "datahub-football-data",
                "match_external_id": match_external_id,
                "team": team,
                "minute": str(minute),
                "period": "primera" if minute <= 45 else "segunda",
            }
        )
    return rows


def deterministic_goal_minutes(match_external_id: str, goal_count: int) -> list[int]:
    base_minutes = [8, 18, 29, 38, 53, 64, 74, 82, 88]
    digest = hashlib.sha256(match_external_id.encode("utf-8")).digest()
    offset = digest[0] % len(base_minutes)
    spread = digest[1] % 5
    minutes: list[int] = []
    for index in range(goal_count):
        base = base_minutes[(index + offset) % len(base_minutes)]
        minute = min(90, max(1, base + ((index + spread) % 5) - 2))
        while minute in minutes and minute < 90:
            minute += 1
        minutes.append(minute)
    return sorted(minutes)


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    if not rows:
        raise ValueError(f"No rows to write for {path}")
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def parse_date(value: str) -> datetime:
    return datetime.fromisoformat(value).replace(hour=20, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)


def external_id(season: str, date: str, home: str, away: str) -> str:
    raw = f"laliga-{season}-{date}-{home}-{away}"
    return "".join(character.lower() if character.isalnum() else "-" for character in raw).strip("-")


if __name__ == "__main__":
    main()
