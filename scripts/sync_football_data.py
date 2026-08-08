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
FOOTBALL_DATA_EXTRA_URL = "https://www.football-data.co.uk/new/{country_code}.csv"

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

EXTRA_COUNTRY_CODES = {
    "ARG": "Argentina",
    "AUT": "Austria",
    "BRA": "Brazil",
    "CHN": "China",
    "DNK": "Denmark",
    "FIN": "Finland",
    "IRL": "Ireland",
    "JPN": "Japan",
    "MEX": "Mexico",
    "NOR": "Norway",
    "POL": "Poland",
    "ROU": "Romania",
    "RUS": "Russia",
    "SWE": "Sweden",
    "SWZ": "Switzerland",
    "USA": "USA",
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
    parser.add_argument("--include-extra", action="store_true", help="Also import the extra country CSV files from Football-Data.")
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

    if args.include_extra:
        for country_code in EXTRA_COUNTRY_CODES:
            source_path = SOURCE_DIR / f"extra-{country_code}.csv"
            download_extra_country(country_code, source_path)
            rows = read_csv(source_path)
            converted = convert_extra_country_rows(country_code, rows)
            result_rows.extend(converted)

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


def download_extra_country(country_code: str, path: Path) -> None:
    url = FOOTBALL_DATA_EXTRA_URL.format(country_code=country_code)
    with urllib.request.urlopen(url, timeout=45) as response:
        path.write_bytes(response.read())


def read_csv(path: Path) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(path.read_text(encoding="utf-8-sig", errors="replace"))))


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


def convert_extra_country_rows(country_code: str, rows: list[dict[str, str]]) -> list[dict[str, str]]:
    clean_rows = [
        row
        for row in rows
        if row.get("Country")
        and row.get("League")
        and row.get("Season")
        and row.get("Date")
        and row.get("Home")
        and row.get("Away")
        and row.get("HG") not in {None, ""}
        and row.get("AG") not in {None, ""}
    ]
    latest_seasons = set(sorted({row["Season"].strip() for row in clean_rows}, key=season_sort_key)[-3:])
    result_rows: list[dict[str, str]] = []
    grouped_indexes: dict[tuple[str, str], int] = {}

    for row in sorted(clean_rows, key=lambda item: (season_sort_key(item["Season"]), parse_match_datetime(item["Date"], item.get("Time")), item["Home"], item["Away"])):
        season = row["Season"].strip()
        if season not in latest_seasons:
            continue
        country = (row.get("Country") or EXTRA_COUNTRY_CODES.get(country_code) or country_code).strip()
        competition = row["League"].strip()
        group_key = (competition, season)
        grouped_indexes[group_key] = grouped_indexes.get(group_key, 0) + 1
        match_date = parse_match_datetime(row["Date"], row.get("Time"))
        home = row["Home"].strip()
        away = row["Away"].strip()
        external_id = make_external_id(f"extra-{country_code}", season, f"{row['Date']} {row.get('Time') or ''}", home, away)
        result_rows.append(
            {
                "competition": competition,
                "season": season,
                "country": country,
                "competition_type": "domestic_league",
                "matchday": str(grouped_indexes[group_key]),
                "match_date": match_date.isoformat(),
                "home_team": home,
                "away_team": away,
                "stadium": "",
                "city": "",
                "home_score": str(optional_int(row["HG"]) or 0),
                "away_score": str(optional_int(row["AG"]) or 0),
                "status": "finished",
                "is_friendly": "false",
                "source": "football-data",
                "external_id": external_id,
            }
        )

    return result_rows


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
        home_odds, draw_odds, away_odds, odds_source = pick_odds(row)
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
                "home_ht_score": optional_str_int(row.get("HTHG")),
                "away_ht_score": optional_str_int(row.get("HTAG")),
                "home_shots": optional_str_int(row.get("HS")),
                "away_shots": optional_str_int(row.get("AS")),
                "home_shots_on_target": optional_str_int(row.get("HST")),
                "away_shots_on_target": optional_str_int(row.get("AST")),
                "home_yellow_cards": optional_str_int(row.get("HY")),
                "away_yellow_cards": optional_str_int(row.get("AY")),
                "home_red_cards": optional_str_int(row.get("HR")),
                "away_red_cards": optional_str_int(row.get("AR")),
                "home_odds": home_odds,
                "draw_odds": draw_odds,
                "away_odds": away_odds,
                "odds_source": odds_source,
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


def parse_match_datetime(date_value: str, time_value: str | None = None) -> datetime:
    parsed = parse_date(date_value)
    if not time_value:
        return parsed
    time_value = time_value.strip()
    try:
        hour, minute = time_value.split(":", maxsplit=1)
        return parsed.replace(hour=int(hour), minute=int(minute[:2]))
    except ValueError:
        return parsed


def season_sort_key(value: str) -> tuple[int, int, str]:
    value = value.strip()
    if "/" in value:
        first, second = value.split("/", maxsplit=1)
        return (int(first), int(second), value)
    if value.isdigit():
        year = int(value)
        return (year, year, value)
    return (0, 0, value)


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

    competitions = {(competition.normalized_name, normalize_name(competition.country or "")): competition for competition in db.scalars(select(Competition)).all()}
    teams = {(team.normalized_name, normalize_name(team.country or "")): team for team in db.scalars(select(Team)).all()}
    existing_matches = {(match.source, match.external_id): match for match in db.scalars(select(Match).where(Match.source == "football-data")).all()}
    seasons: dict[tuple[int, str], Season] = {
        (season.competition_id, season.name): season for season in db.scalars(select(Season)).all()
    }
    created = 0
    updated = 0

    for index, row in enumerate(rows, start=1):
        country_key = normalize_name(row.get("country") or "")
        competition_key = (normalize_name(row["competition"]), country_key)
        competition = competitions.get(competition_key)
        if not competition:
            competition = Competition(
                name=row["competition"],
                normalized_name=competition_key[0],
                country=row.get("country"),
                competition_type=row.get("competition_type") or "domestic_league",
                source="football-data",
                external_id=f"{country_key}:{competition_key[0]}",
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
            apply_match_enrichment(match, row)
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
            apply_match_enrichment(match, row)
            db.add(match)
            existing_matches[match_key] = match
            created += 1
        if index % 1000 == 0:
            db.flush()

    db.commit()
    return created, updated


def get_or_create_team(db, teams: dict[tuple[str, str], object], name: str, country: str | None, normalize_name):
    from app.models import Team

    normalized = normalize_name(name)
    country_key = normalize_name(country or "")
    team = teams.get((normalized, country_key))
    if team:
        return team
    team = Team(name=name, normalized_name=normalized, country=country, external_id=f"football-data:{country_key}:{normalized}")
    db.add(team)
    db.flush()
    teams[(normalized, country_key)] = team
    return team


def optional_int(value: str | None) -> int | None:
    if value in {None, ""}:
        return None
    return int(float(value))


def optional_str_int(value: str | None) -> str:
    parsed = optional_int(value)
    return "" if parsed is None else str(parsed)


def optional_float(value: str | None) -> float | None:
    if value in {None, ""}:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def pick_odds(row: dict[str, str]) -> tuple[str, str, str, str]:
    for prefix, source in (("Avg", "football-data-avg"), ("B365", "football-data-b365"), ("PS", "football-data-pinnacle")):
        home = optional_float(row.get(f"{prefix}H"))
        draw = optional_float(row.get(f"{prefix}D"))
        away = optional_float(row.get(f"{prefix}A"))
        if home is not None and draw is not None and away is not None:
            return (str(home), str(draw), str(away), source)
    return ("", "", "", "")


def apply_match_enrichment(match, row: dict[str, str]) -> None:
    from decimal import Decimal

    match.home_score = optional_int(row.get("home_score"))
    match.away_score = optional_int(row.get("away_score"))
    match.home_ht_score = optional_int(row.get("home_ht_score"))
    match.away_ht_score = optional_int(row.get("away_ht_score"))
    match.home_shots = optional_int(row.get("home_shots"))
    match.away_shots = optional_int(row.get("away_shots"))
    match.home_shots_on_target = optional_int(row.get("home_shots_on_target"))
    match.away_shots_on_target = optional_int(row.get("away_shots_on_target"))
    match.home_yellow_cards = optional_int(row.get("home_yellow_cards"))
    match.away_yellow_cards = optional_int(row.get("away_yellow_cards"))
    match.home_red_cards = optional_int(row.get("home_red_cards"))
    match.away_red_cards = optional_int(row.get("away_red_cards"))
    home_odds = optional_float(row.get("home_odds"))
    draw_odds = optional_float(row.get("draw_odds"))
    away_odds = optional_float(row.get("away_odds"))
    match.home_odds = Decimal(str(home_odds)) if home_odds is not None else None
    match.draw_odds = Decimal(str(draw_odds)) if draw_odds is not None else None
    match.away_odds = Decimal(str(away_odds)) if away_odds is not None else None
    match.odds_source = row.get("odds_source") or None


if __name__ == "__main__":
    main()
