from __future__ import annotations

import argparse
import csv
import io
import urllib.request
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IMPORT_DIR = ROOT / "data" / "imports"
SOURCE_DIR = IMPORT_DIR / "football-data-sources"

SEASONS = {
    "2023/2024": "2324",
    "2024/2025": "2425",
    "2025/2026": "2526",
}

FOOTBALL_DATA_ZIP_URL = "https://www.football-data.co.uk/mmz4281/{season_code}/data.zip"

LEAGUES = {
    "E0": ("Premier League", "England"),
    "E1": ("Championship", "England"),
    "E2": ("League One", "England"),
    "E3": ("League Two", "England"),
    "EC": ("National League", "England"),
    "SC0": ("Scottish Premiership", "Scotland"),
    "SC1": ("Scottish Championship", "Scotland"),
    "SC2": ("Scottish League One", "Scotland"),
    "SC3": ("Scottish League Two", "Scotland"),
    "D1": ("Bundesliga", "Germany"),
    "D2": ("2. Bundesliga", "Germany"),
    "I1": ("Serie A", "Italy"),
    "I2": ("Serie B", "Italy"),
    "SP1": ("LaLiga", "Spain"),
    "SP2": ("Segunda Division", "Spain"),
    "F1": ("Ligue 1", "France"),
    "F2": ("Ligue 2", "France"),
    "N1": ("Eredivisie", "Netherlands"),
    "B1": ("Belgian Pro League", "Belgium"),
    "P1": ("Primeira Liga", "Portugal"),
    "T1": ("Super Lig", "Turkey"),
    "G1": ("Super League Greece", "Greece"),
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
    parser = argparse.ArgumentParser(description="Download Football-Data CSV files and convert them into WITHIN import CSVs.")
    parser.add_argument("--import-db", action="store_true", help="Import generated CSV files into the configured local database.")
    parser.add_argument("--with-standings", action="store_true", help="Also import generated standings snapshots. Slower on SQLite.")
    args = parser.parse_args()

    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)

    result_rows: list[dict[str, str]] = []
    standing_rows: list[dict[str, str]] = []

    for season, season_code in SEASONS.items():
        zip_path = SOURCE_DIR / f"football-data-{season_code}.zip"
        download_zip(season_code, zip_path)
        source_files = extract_league_files(zip_path, season_code)
        for league_code, rows in source_files.items():
            if not rows:
                continue
            converted, standings = convert_league_rows(season, league_code, rows)
            result_rows.extend(converted)
            standing_rows.extend(standings)

    results_path = IMPORT_DIR / "football-data-2023-2026-results.csv"
    standings_path = IMPORT_DIR / "football-data-2023-2026-standings.csv"
    write_csv(results_path, result_rows)
    write_csv(standings_path, standing_rows)
    print(f"results={len(result_rows)} -> {results_path}")
    print(f"standings={len(standing_rows)} -> {standings_path}")

    if args.import_db:
        import_into_database(results_path, standings_path if args.with_standings else None)


def download_zip(season_code: str, path: Path) -> None:
    if path.exists() and path.stat().st_size > 0:
        return
    url = FOOTBALL_DATA_ZIP_URL.format(season_code=season_code)
    with urllib.request.urlopen(url, timeout=45) as response:
        path.write_bytes(response.read())


def extract_league_files(zip_path: Path, season_code: str) -> dict[str, list[dict[str, str]]]:
    rows_by_league: dict[str, list[dict[str, str]]] = {}
    with zipfile.ZipFile(zip_path) as archive:
        for league_code in LEAGUES:
            member = f"{league_code}.csv"
            if member not in archive.namelist():
                continue
            source_path = SOURCE_DIR / f"{season_code}-{league_code}.csv"
            content = archive.read(member)
            source_path.write_bytes(content)
            text = content.decode("utf-8-sig", errors="replace")
            rows_by_league[league_code] = list(csv.DictReader(io.StringIO(text)))
    return rows_by_league


def convert_league_rows(season: str, league_code: str, rows: list[dict[str, str]]) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    competition, country = LEAGUES[league_code]
    clean_rows = [
        row
        for row in rows
        if row.get("Date") and row.get("HomeTeam") and row.get("AwayTeam") and row.get("FTHG") not in {None, ""} and row.get("FTAG") not in {None, ""}
    ]
    clean_rows.sort(key=lambda row: (parse_date(row["Date"]), row["HomeTeam"], row["AwayTeam"]))
    teams = sorted({row["HomeTeam"] for row in clean_rows} | {row["AwayTeam"] for row in clean_rows})
    table = {team: TeamStanding() for team in teams}
    result_rows: list[dict[str, str]] = []
    standing_rows: list[dict[str, str]] = []
    matches_per_round = max(len(teams) // 2, 1)

    for index, row in enumerate(clean_rows):
        matchday = (index // matches_per_round) + 1
        if index % matches_per_round == 0:
            snapshot_date = parse_date(row["Date"]) - timedelta(minutes=1)
            standing_rows.extend(build_standing_rows(competition, season, country, matchday, snapshot_date, table))
        match_date = parse_date(row["Date"])
        home = row["HomeTeam"].strip()
        away = row["AwayTeam"].strip()
        home_score = int(row["FTHG"])
        away_score = int(row["FTAG"])
        external_id = make_external_id(league_code, season, row["Date"], home, away)
        result_rows.append(
            {
                "competition": competition,
                "season": season,
                "country": country,
                "competition_type": "domestic_league",
                "matchday": str(matchday),
                "match_date": match_date.isoformat(),
                "home_team": home,
                "away_team": away,
                "stadium": "",
                "city": "",
                "home_score": str(home_score),
                "away_score": str(away_score),
                "status": "finished",
                "is_friendly": "false",
                "source": "football-data",
                "external_id": external_id,
            }
        )
        apply_result(table[home], table[away], home_score, away_score)

    return result_rows, standing_rows


def build_standing_rows(
    competition: str,
    season: str,
    country: str,
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
    elif home_score < away_score:
        away.won += 1
        home.lost += 1
        away.points += 3
    else:
        home.drawn += 1
        away.drawn += 1
        home.points += 1
        away.points += 1


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    if not rows:
        raise ValueError(f"No rows to write for {path}")
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def parse_date(value: str) -> datetime:
    value = value.strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).replace(hour=20, minute=0, tzinfo=timezone.utc)
        except ValueError:
            continue
    raise ValueError(f"Unsupported Football-Data date: {value}")


def make_external_id(league_code: str, season: str, date: str, home: str, away: str) -> str:
    raw = f"football-data-{league_code}-{season}-{date}-{home}-{away}"
    return "".join(character.lower() if character.isalnum() else "-" for character in raw).strip("-")


def import_into_database(results_path: Path, standings_path: Path | None) -> None:
    import sys

    sys.path.insert(0, str(ROOT / "backend"))
    from app.database import SessionLocal
    from app.services.csv_imports import import_standings_csv

    db = SessionLocal()
    try:
        created, updated = fast_import_results(db, results_path)
        print(f"imported_results created={created} updated={updated}")
        if standings_path:
            standings = import_standings_csv(db, standings_path.read_bytes())
            print(f"imported_standings created={standings.created} updated={standings.updated} skipped={standings.skipped} errors={len(standings.errors)}")
    finally:
        db.close()


def fast_import_results(db, results_path: Path) -> tuple[int, int]:
    from sqlalchemy import select

    from app.models import Competition, Match, Season, Team
    from app.utils.normalization import normalize_name

    with results_path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    competitions = {competition.normalized_name: competition for competition in db.scalars(select(Competition)).all()}
    teams = {team.normalized_name: team for team in db.scalars(select(Team)).all()}
    existing_matches = {(match.source, match.external_id): match for match in db.scalars(select(Match).where(Match.source == "football-data")).all()}
    seasons: dict[tuple[int, str], Season] = {
        (season.competition_id, season.name): season for season in db.scalars(select(Season)).all()
    }
    created = 0
    updated = 0

    for index, row in enumerate(rows, start=1):
        competition_key = normalize_name(row["competition"])
        competition = competitions.get(competition_key)
        if not competition:
            competition = Competition(
                name=row["competition"],
                normalized_name=competition_key,
                country=row.get("country"),
                competition_type=row.get("competition_type") or "domestic_league",
                source="football-data",
                external_id=competition_key,
            )
            db.add(competition)
            db.flush()
            competitions[competition_key] = competition

        season_key = (competition.id, row["season"])
        season = seasons.get(season_key)
        if not season:
            season = Season(competition_id=competition.id, name=row["season"], is_current=row["season"] == "2025/2026")
            db.add(season)
            db.flush()
            seasons[season_key] = season

        home = get_or_create_team(db, teams, row["home_team"], row.get("country"), normalize_name)
        away = get_or_create_team(db, teams, row["away_team"], row.get("country"), normalize_name)
        match_key = (row.get("source") or "football-data", row["external_id"])
        match = existing_matches.get(match_key)
        if match:
            match.home_score = optional_int(row.get("home_score"))
            match.away_score = optional_int(row.get("away_score"))
            match.status = row.get("status") or match.status
            updated += 1
        else:
            match = Match(
                competition_id=competition.id,
                season_id=season.id,
                matchday=optional_int(row.get("matchday")),
                match_date=datetime.fromisoformat(row["match_date"]),
                home_team_id=home.id,
                away_team_id=away.id,
                stadium_id=None,
                home_score=optional_int(row.get("home_score")),
                away_score=optional_int(row.get("away_score")),
                status=row.get("status") or "finished",
                is_friendly=(row.get("is_friendly") or "").lower() == "true",
                source=match_key[0],
                external_id=match_key[1],
            )
            db.add(match)
            existing_matches[match_key] = match
            created += 1
        if index % 1000 == 0:
            db.flush()

    db.commit()
    return created, updated


def get_or_create_team(db, teams: dict[str, object], name: str, country: str | None, normalize_name):
    from app.models import Team

    normalized = normalize_name(name)
    team = teams.get(normalized)
    if team:
        return team
    team = Team(name=name, normalized_name=normalized, country=country, external_id=f"football-data:{normalized}")
    db.add(team)
    db.flush()
    teams[normalized] = team
    return team


def optional_int(value: str | None) -> int | None:
    if value in {None, ""}:
        return None
    return int(float(value))


if __name__ == "__main__":
    main()
