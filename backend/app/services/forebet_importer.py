from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from difflib import SequenceMatcher
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Competition, ForebetPrediction, Match, Season, Team
from app.utils.normalization import normalize_name


FOREBET_PREDICTIONS_URL = "https://www.forebet.com/en/football-predictions"
FOREBET_READER_URL = "https://r.jina.ai/http://r.jina.ai/http://https://www.forebet.com/en/football-predictions"
DATE_RE = re.compile(r"(?P<day>\d{2})/(?P<month>\d{2})/(?P<year>\d{4})\s+(?P<time>\d{1,2}:\d{2})")
READER_DATE_RE = re.compile(
    r"(?P<month>\d{2})/(?P<day>\d{2})/(?P<year>\d{4})\s+(?P<hour>\d{1,2}):(?P<minute>\d{2})\s+(?P<ampm>AM|PM)"
)
READER_EU_DATE_RE = re.compile(r"(?P<day>\d{2})/(?P<month>\d{2})/(?P<year>\d{4})\s+(?P<hour>\d{1,2}):(?P<minute>\d{2})")
READER_STATS_RE = re.compile(
    r"^(?P<home_probability>\d{2})(?P<draw_probability>\d{2})(?P<away_probability>\d{2})"
    r"(?P<prediction>[12X])(?P<home_score>\d+)\s*-\s*(?P<away_score>\d+)"
    r"(?P<expected_goals>\d+\.\d{2})"
)
SCORE_RE = re.compile(r"\b(?P<home>\d+)\s*-\s*(?P<away>\d+)\b")
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
}


@dataclass
class ForebetSourcePrediction:
    home_team: str
    away_team: str
    match_date: datetime
    prediction: str | None = None
    predicted_score: str | None = None
    expected_goals: Decimal | None = None
    home_probability: Decimal | None = None
    draw_probability: Decimal | None = None
    away_probability: Decimal | None = None


@dataclass
class ForebetImportOutcome:
    status: str
    message: str
    source_url: str
    fetched: int = 0
    imported: int = 0
    matched: int = 0
    created_matches: int = 0
    unmatched: int = 0
    predictions: list[ForebetSourcePrediction] = field(default_factory=list)


def import_forebet_jornada(db: Session, target_date: date) -> ForebetImportOutcome:
    source_url = _forebet_url(target_date)
    try:
        response = requests.get(
            source_url,
            timeout=15,
            headers=REQUEST_HEADERS,
        )
    except requests.RequestException as exc:
        predictions = _fetch_forebet_reader_predictions(target_date)
        if predictions:
            return _store_forebet_predictions(db, target_date, source_url, predictions, "reader_fallback")
        return ForebetImportOutcome(status="request_failed", message=f"No se pudo conectar con Forebet: {exc}", source_url=source_url)

    if _is_cloudflare_challenge(response.text):
        predictions = _fetch_forebet_reader_predictions(target_date)
        if predictions:
            return _store_forebet_predictions(db, target_date, source_url, predictions, "reader_fallback")
        return ForebetImportOutcome(
            status="blocked",
            message=(
                "Forebet ha devuelto una proteccion anti-bot en lugar de datos. "
                "Para produccion estable necesitaremos una API autorizada o un proveedor de datos."
            ),
            source_url=source_url,
        )

    if response.status_code >= 400:
        predictions = _fetch_forebet_reader_predictions(target_date)
        if predictions:
            return _store_forebet_predictions(db, target_date, source_url, predictions, "reader_fallback")
        return ForebetImportOutcome(status="http_error", message=f"Forebet respondio con HTTP {response.status_code}.", source_url=source_url)

    predictions = _parse_forebet_predictions(response.text, target_date)
    if not predictions:
        predictions = _fetch_forebet_reader_predictions(target_date)
    if not predictions:
        return ForebetImportOutcome(
            status="no_forebet_matches",
            message="Forebet respondio, pero no se pudieron extraer partidos para esa fecha.",
            source_url=source_url,
        )

    return _store_forebet_predictions(db, target_date, source_url, predictions, "ok")


def _store_forebet_predictions(
    db: Session,
    target_date: date,
    source_url: str,
    predictions: list[ForebetSourcePrediction],
    fetch_status: str,
) -> ForebetImportOutcome:
    local_matches = _local_matches_for_date(db, target_date)
    imported = 0
    matched = 0
    created_matches = 0
    unmatched = 0
    captured_at = datetime.now(UTC)
    try:
        for prediction in predictions:
            match = _best_local_match(db, prediction, local_matches)
            if match:
                matched += 1
            else:
                match = _get_or_create_forebet_match(db, prediction)
                local_matches.append(match)
                created_matches += 1
            if _prediction_exists(db, match.id, prediction):
                continue
            predicted_home_score, predicted_away_score = _split_score(prediction.predicted_score)
            db.add(
                ForebetPrediction(
                    match_id=match.id,
                    captured_at=captured_at,
                    home_probability=prediction.home_probability,
                    draw_probability=prediction.draw_probability,
                    away_probability=prediction.away_probability,
                    prediction=prediction.prediction,
                    predicted_home_score=predicted_home_score,
                    predicted_away_score=predicted_away_score,
                    expected_goals=prediction.expected_goals,
                    source_url=source_url,
                )
            )
            imported += 1

        db.commit()
    except Exception as exc:
        db.rollback()
        return ForebetImportOutcome(
            status="storage_unavailable",
            message=(
                "Forebet devolvio partidos y se mostraran como lectura temporal. "
                "Para guardarlos de forma persistente en produccion hace falta una base de datos externa."
            ),
            source_url=source_url,
            fetched=len(predictions),
            imported=0,
            matched=matched,
            created_matches=created_matches,
            unmatched=len(predictions) - matched - created_matches,
            predictions=predictions,
        )

    unmatched = len(predictions) - matched - created_matches
    return ForebetImportOutcome(
        status=fetch_status,
        message=(
            f"Forebet devolvio {len(predictions)} partidos. "
            f"Se cruzaron {matched} con partidos cargados, se crearon {created_matches} partidos nuevos "
            f"y se importaron {imported} predicciones."
        ),
        source_url=source_url,
        fetched=len(predictions),
        imported=imported,
        matched=matched,
        created_matches=created_matches,
        unmatched=unmatched,
        predictions=predictions,
    )


def _forebet_url(target_date: date) -> str:
    return f"{FOREBET_PREDICTIONS_URL}?lang=en"


def _fetch_forebet_reader_predictions(target_date: date) -> list[ForebetSourcePrediction]:
    try:
        response = requests.get(FOREBET_READER_URL, timeout=15, headers=REQUEST_HEADERS)
    except requests.RequestException:
        return []
    if response.status_code >= 400:
        return []
    return _parse_forebet_reader_predictions(response.text, target_date)


def _is_cloudflare_challenge(html: str) -> bool:
    lowered = html.lower()
    return "just a moment" in lowered and ("cloudflare" in lowered or "cf_chl" in lowered)


def _parse_forebet_predictions(html: str, target_date: date) -> list[ForebetSourcePrediction]:
    soup = BeautifulSoup(html, "html.parser")
    predictions: list[ForebetSourcePrediction] = []
    for row in soup.select("tr"):
        item = _prediction_from_row(row, target_date)
        if item:
            predictions.append(item)
    return predictions


def _parse_forebet_reader_predictions(markdown: str, target_date: date) -> list[ForebetSourcePrediction]:
    raw_lines = [line.strip() for line in markdown.splitlines() if line.strip()]
    lines = [_clean_reader_line(line) for line in raw_lines]
    predictions: list[ForebetSourcePrediction] = []
    for index, line in enumerate(lines):
        parsed_date = _parse_forebet_reader_datetime(line)
        if not parsed_date or parsed_date.date() != target_date:
            continue
        if index + 1 >= len(lines):
            continue
        match_label, href = _reader_match_reference(raw_lines[index])
        if match_label:
            teams = _split_reader_compact_teams(match_label)
            stats = _reader_stats_from_lines(lines, index + 1)
        else:
            if index < 2:
                continue
            teams = (lines[index - 2], lines[index - 1])
            stats = _reader_stats_from_lines(lines, index + 1)
        if not teams or not stats:
            continue
        predictions.append(
            ForebetSourcePrediction(
                home_team=teams[0],
                away_team=teams[1],
                match_date=parsed_date,
                prediction=stats["prediction"],
                predicted_score=stats["predicted_score"],
                expected_goals=stats["expected_goals"],
                home_probability=stats["home_probability"],
                draw_probability=stats["draw_probability"],
                away_probability=stats["away_probability"],
            )
        )
    return predictions


def _clean_reader_line(line: str) -> str:
    line = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", line)
    line = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line)
    line = re.sub(r"cite\d+†([^]+)", r"\1", line)
    return re.sub(r"\s+", " ", line).strip()


def _reader_match_reference(line: str) -> tuple[str, str | None]:
    href_match = re.search(r"\[([^\]]+)\]\((https?://[^)]+|/[^)]+)\)", line)
    if href_match:
        label = href_match.group(1)
        href = href_match.group(2)
    else:
        label = line
        href = None
    label = READER_DATE_RE.sub("", label)
    label = READER_EU_DATE_RE.sub("", label).strip(" -")
    if not label:
        return "", href
    return label, href


def _reader_stats_from_lines(lines: list[str], start_index: int) -> dict[str, Decimal | str | None] | None:
    compact_line = lines[start_index].replace(" ", "") if start_index < len(lines) else ""
    compact_match = READER_STATS_RE.search(compact_line)
    if compact_match:
        return {
            "prediction": compact_match.group("prediction"),
            "predicted_score": f"{compact_match.group('home_score')}-{compact_match.group('away_score')}",
            "expected_goals": Decimal(compact_match.group("expected_goals")),
            "home_probability": Decimal(compact_match.group("home_probability")),
            "draw_probability": Decimal(compact_match.group("draw_probability")),
            "away_probability": Decimal(compact_match.group("away_probability")),
        }

    probabilities = _probabilities_from_text(lines[start_index] if start_index < len(lines) else "")
    if len(probabilities) < 3:
        return None
    prediction, predicted_score = _prediction_and_score(lines[start_index + 1] if start_index + 1 < len(lines) else "")
    if not predicted_score and start_index + 2 < len(lines):
        _, predicted_score = _prediction_and_score(lines[start_index + 2])
    expected_goals = next(
        (
            _decimal(lines[index])
            for index in range(start_index + 2, min(len(lines), start_index + 6))
            if _decimal(lines[index]) is not None and "." in lines[index]
        ),
        None,
    )
    return {
        "prediction": prediction,
        "predicted_score": predicted_score,
        "expected_goals": expected_goals,
        "home_probability": probabilities[0],
        "draw_probability": probabilities[1],
        "away_probability": probabilities[2],
    }


def _teams_from_reader_detail_page(href: str | None) -> tuple[str, str] | None:
    if not href:
        return None
    source_url = href if href.startswith("http") else urljoin(FOREBET_PREDICTIONS_URL, href)
    teams = _teams_from_detail_page(source_url)
    if teams:
        return teams
    reader_url = f"https://r.jina.ai/http://r.jina.ai/http://{source_url}"
    try:
        response = requests.get(reader_url, timeout=5, headers=REQUEST_HEADERS)
    except requests.RequestException:
        return None
    if response.status_code >= 400:
        return None
    for line in response.text.splitlines():
        teams = _split_vs_text(_clean_reader_line(line))
        if teams:
            return teams
    return None


def _split_reader_compact_teams(label: str) -> tuple[str, str] | None:
    teams = _split_vs_text(label)
    if teams:
        return teams
    words = label.split()
    if len(words) < 2:
        return None
    split_index = _reader_team_split_index(words)
    home = " ".join(words[:split_index]).strip()
    away = " ".join(words[split_index:]).strip()
    if not home or not away:
        return None
    return home, away


def _reader_team_split_index(words: list[str]) -> int:
    prefixes = {"AC", "AEK", "CA", "CS", "FC", "FK", "GKS", "HB", "IFK", "MSK", "NK", "RB", "SL"}
    home_second_words = {"Bratislava", "Juniors", "Zabrze", "Zvezda"}
    if len(words) == 2:
        return 1
    if len(words) == 3:
        if words[1] in home_second_words:
            return 2
        return 2 if len(words[0]) <= 4 or words[0].isupper() else 1
    if len(words) == 4:
        if words[0].upper() in prefixes:
            return 3
        return 2
    if len(words) == 5:
        if words[2].upper() in prefixes or words[1] in home_second_words:
            return 2
        return 3
    return max(1, len(words) // 2)


def _prediction_from_row(row, target_date: date) -> ForebetSourcePrediction | None:
    cells = [cell.get_text(" ", strip=True) for cell in row.select("th,td") if cell.get_text(" ", strip=True)]
    item = _prediction_from_cells(cells, target_date)
    if item:
        return item

    match_anchor = next((anchor for anchor in row.select("a") if DATE_RE.search(anchor.get_text(" ", strip=True))), None)
    if not match_anchor:
        return None
    match_text = match_anchor.get_text(" ", strip=True)
    parsed_date = _parse_forebet_datetime(match_text)
    if not parsed_date or parsed_date.date() != target_date:
        return None
    teams = _teams_from_anchor(match_anchor, match_text)
    if not teams:
        teams = _teams_from_detail_page(match_anchor.get("href"))
    if not teams:
        return None

    date_index = next((index for index, cell in enumerate(cells) if DATE_RE.search(cell)), -1)
    rest = cells[date_index + 1 :] if date_index >= 0 else []
    probabilities = _probabilities_from_text(rest[0] if rest else "")
    prediction, predicted_score = _prediction_and_score(rest[1] if len(rest) > 1 else "")
    correct_score = next((match.group(0).replace(" ", "") for cell in rest[2:] for match in [SCORE_RE.search(cell)] if match), None)
    expected_goals = next((_decimal(cell) for cell in rest[2:] if _decimal(cell) is not None and "." in cell), None)
    return ForebetSourcePrediction(
        home_team=teams[0],
        away_team=teams[1],
        match_date=parsed_date,
        prediction=prediction,
        predicted_score=predicted_score or correct_score,
        expected_goals=expected_goals,
        home_probability=probabilities[0] if len(probabilities) > 0 else None,
        draw_probability=probabilities[1] if len(probabilities) > 1 else None,
        away_probability=probabilities[2] if len(probabilities) > 2 else None,
    )


def _prediction_from_cells(cells: list[str], target_date: date) -> ForebetSourcePrediction | None:
    if len(cells) < 5:
        return None
    date_index = next((index for index, cell in enumerate(cells) if DATE_RE.search(cell)), None)
    if date_index is None:
        return None
    parsed_date = _parse_forebet_datetime(cells[date_index])
    if not parsed_date or parsed_date.date() != target_date:
        return None
    if date_index < 2:
        return None
    home_team = cells[date_index - 2]
    away_team = cells[date_index - 1]
    rest = cells[date_index + 1 :]
    probabilities = [_decimal(cell) for cell in rest[:3]]
    prediction = next((cell for cell in rest[3:7] if cell in {"1", "X", "2"}), None)
    predicted_score = next((match.group(0).replace(" ", "") for cell in rest for match in [SCORE_RE.search(cell)] if match), None)
    expected_goals = next((_decimal(cell) for cell in rest if _decimal(cell) is not None and "." in cell), None)
    return ForebetSourcePrediction(
        home_team=home_team,
        away_team=away_team,
        match_date=parsed_date,
        prediction=prediction,
        predicted_score=predicted_score,
        expected_goals=expected_goals,
        home_probability=probabilities[0] if len(probabilities) > 0 else None,
        draw_probability=probabilities[1] if len(probabilities) > 1 else None,
        away_probability=probabilities[2] if len(probabilities) > 2 else None,
    )


def _teams_from_anchor(anchor, match_text: str) -> tuple[str, str] | None:
    for attr_name in ("title", "aria-label"):
        value = anchor.get(attr_name) or ""
        teams = _split_vs_text(value)
        if teams:
            return teams
    return _split_vs_text(match_text)


def _teams_from_detail_page(href: str | None) -> tuple[str, str] | None:
    if not href:
        return None
    url = urljoin(FOREBET_PREDICTIONS_URL, href)
    try:
        response = requests.get(url, timeout=5, headers=REQUEST_HEADERS)
    except requests.RequestException:
        return None
    if response.status_code >= 400 or _is_cloudflare_challenge(response.text):
        return None
    soup = BeautifulSoup(response.text, "html.parser")
    candidates = []
    if soup.title and soup.title.string:
        candidates.append(soup.title.string)
    candidates.extend(element.get_text(" ", strip=True) for element in soup.select("h1,h2"))
    for text in candidates:
        teams = _split_vs_text(text)
        if teams:
            return teams
    return None


def _split_vs_text(value: str) -> tuple[str, str] | None:
    cleaned = re.sub(r"\s+", " ", value.replace("#", " ")).strip()
    match = re.search(r"(.+?)\s+(?:VS|vs|v)\s+(.+?)(?:\s+Prediction|\s+Stats|\s+H2H|$)", cleaned)
    if not match:
        return None
    home = match.group(1).strip(" -:")
    away = match.group(2).strip(" -:")
    if not home or not away:
        return None
    return home, away


def _probabilities_from_text(value: str) -> list[Decimal]:
    values = []
    for item in value.split():
        parsed = _decimal(item)
        if parsed is not None:
            values.append(parsed)
    return values[:3]


def _prediction_and_score(value: str) -> tuple[str | None, str | None]:
    parts = value.split()
    prediction = next((part for part in parts if part in {"1", "X", "2"}), None)
    score = next((match.group(0).replace(" ", "") for match in [SCORE_RE.search(value)] if match), None)
    if not score:
        score = next((part for part in parts if re.fullmatch(r"\d+\s*-\s*\d+", part)), None)
    return prediction, score


def _parse_forebet_datetime(value: str) -> datetime | None:
    match = DATE_RE.search(value)
    if not match:
        return None
    return datetime(
        int(match.group("year")),
        int(match.group("month")),
        int(match.group("day")),
        int(match.group("time").split(":")[0]),
        int(match.group("time").split(":")[1]),
        tzinfo=UTC,
    )


def _parse_forebet_reader_datetime(value: str) -> datetime | None:
    match = READER_DATE_RE.search(value)
    if match:
        hour = int(match.group("hour"))
        if match.group("ampm") == "PM" and hour != 12:
            hour += 12
        if match.group("ampm") == "AM" and hour == 12:
            hour = 0
        return datetime(
            int(match.group("year")),
            int(match.group("month")),
            int(match.group("day")),
            hour,
            int(match.group("minute")),
            tzinfo=UTC,
        )
    match = READER_EU_DATE_RE.search(value)
    if not match:
        return None
    hour = int(match.group("hour"))
    return datetime(
        int(match.group("year")),
        int(match.group("month")),
        int(match.group("day")),
        hour,
        int(match.group("minute")),
        tzinfo=UTC,
    )


def _local_matches_for_date(db: Session, target_date: date) -> list[Match]:
    return list(
        db.scalars(
            select(Match)
            .where(func.date(Match.match_date) == target_date.isoformat())
            .order_by(Match.match_date, Match.id)
        ).all()
    )


def _best_local_match(db: Session, prediction: ForebetSourcePrediction, matches: list[Match]) -> Match | None:
    best_match: Match | None = None
    best_score = 0.0
    for match in matches:
        home = db.get(Team, match.home_team_id)
        away = db.get(Team, match.away_team_id)
        if not home or not away:
            continue
        score = (_similarity(prediction.home_team, home.name) + _similarity(prediction.away_team, away.name)) / 2
        if score > best_score:
            best_score = score
            best_match = match
    return best_match if best_score >= 0.72 else None


def _get_or_create_forebet_match(db: Session, prediction: ForebetSourcePrediction) -> Match:
    external_id = _forebet_match_external_id(prediction)
    existing = db.scalar(select(Match).where(Match.source == "forebet", Match.external_id == external_id))
    if existing:
        return existing
    competition = _get_or_create_forebet_competition(db)
    season = _get_or_create_forebet_season(db, competition, prediction.match_date.date())
    home_team = _get_or_create_forebet_team(db, prediction.home_team)
    away_team = _get_or_create_forebet_team(db, prediction.away_team)
    match = Match(
        competition_id=competition.id,
        season_id=season.id,
        matchday=None,
        match_date=prediction.match_date,
        home_team_id=home_team.id,
        away_team_id=away_team.id,
        status="scheduled",
        is_friendly=False,
        source="forebet",
        external_id=external_id,
    )
    db.add(match)
    db.flush()
    return match


def _get_or_create_forebet_competition(db: Session) -> Competition:
    normalized = normalize_name("Forebet")
    competition = db.scalar(select(Competition).where(Competition.normalized_name == normalized))
    if competition:
        return competition
    competition = Competition(
        name="Forebet",
        normalized_name=normalized,
        country=None,
        competition_type="external_predictions",
        source="forebet",
        external_id="forebet",
    )
    db.add(competition)
    db.flush()
    return competition


def _get_or_create_forebet_season(db: Session, competition: Competition, match_date: date) -> Season:
    start_year = match_date.year if match_date.month >= 7 else match_date.year - 1
    name = f"{start_year}/{start_year + 1}"
    season = db.scalar(select(Season).where(Season.competition_id == competition.id, Season.name == name))
    if season:
        return season
    season = Season(
        competition_id=competition.id,
        name=name,
        start_date=date(start_year, 7, 1),
        end_date=date(start_year + 1, 6, 30),
        is_current=True,
    )
    db.add(season)
    db.flush()
    return season


def _get_or_create_forebet_team(db: Session, name: str) -> Team:
    normalized = normalize_name(name)
    team = db.scalar(select(Team).where(Team.normalized_name == normalized))
    if team:
        return team
    team = Team(name=name.strip(), normalized_name=normalized, country=None, external_id=f"forebet:{normalized}")
    db.add(team)
    db.flush()
    return team


def _forebet_match_external_id(prediction: ForebetSourcePrediction) -> str:
    return normalize_name(
        "|".join(
            [
                prediction.match_date.date().isoformat(),
                prediction.home_team,
                prediction.away_team,
            ]
        )
    )


def _prediction_exists(db: Session, match_id: int, prediction: ForebetSourcePrediction) -> bool:
    predicted_home_score, predicted_away_score = _split_score(prediction.predicted_score)
    return bool(
        db.scalar(
            select(ForebetPrediction.id)
            .where(
                ForebetPrediction.match_id == match_id,
                ForebetPrediction.prediction == prediction.prediction,
                ForebetPrediction.predicted_home_score == predicted_home_score,
                ForebetPrediction.predicted_away_score == predicted_away_score,
            )
            .limit(1)
        )
    )


def _split_score(value: str | None) -> tuple[int | None, int | None]:
    if not value:
        return None, None
    match = SCORE_RE.search(value)
    if not match:
        return None, None
    return int(match.group("home")), int(match.group("away"))


def _similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, normalize_name(left), normalize_name(right)).ratio()


def _decimal(value: str) -> Decimal | None:
    cleaned = value.strip().replace(",", ".").replace("%", "")
    if not re.fullmatch(r"-?\d+(\.\d+)?", cleaned):
        return None
    return Decimal(cleaned)
