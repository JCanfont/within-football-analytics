from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from difflib import SequenceMatcher

import requests
from bs4 import BeautifulSoup
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Competition, ForebetPrediction, Match, Season, Team
from app.utils.normalization import normalize_name


FOREBET_PREDICTIONS_URL = "https://www.forebet.com/en/football-predictions"
DATE_RE = re.compile(r"(?P<day>\d{2})/(?P<month>\d{2})/(?P<year>\d{4})\s+(?P<time>\d{1,2}:\d{2})")
SCORE_RE = re.compile(r"\b(?P<home>\d+)\s*-\s*(?P<away>\d+)\b")


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


def import_forebet_jornada(db: Session, target_date: date) -> ForebetImportOutcome:
    source_url = _forebet_url(target_date)
    try:
        response = requests.get(
            source_url,
            timeout=15,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
                ),
                "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
            },
        )
    except requests.RequestException as exc:
        return ForebetImportOutcome(
            status="request_failed",
            message=f"No se pudo conectar con Forebet: {exc}",
            source_url=source_url,
        )

    if _is_cloudflare_challenge(response.text):
        return ForebetImportOutcome(
            status="blocked",
            message=(
                "Forebet ha devuelto una proteccion anti-bot en lugar de datos. "
                "Para produccion estable necesitaremos una API autorizada o un proveedor de datos."
            ),
            source_url=source_url,
        )

    if response.status_code >= 400:
        return ForebetImportOutcome(
            status="http_error",
            message=f"Forebet respondio con HTTP {response.status_code}.",
            source_url=source_url,
        )

    predictions = _parse_forebet_predictions(response.text, target_date)
    if not predictions:
        return ForebetImportOutcome(
            status="no_forebet_matches",
            message="Forebet respondio, pero no se pudieron extraer partidos para esa fecha.",
            source_url=source_url,
        )

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
                "Forebet devolvio partidos, pero no se pudieron guardar en la base de datos. "
                f"Detalle: {exc}"
            ),
            source_url=source_url,
            fetched=len(predictions),
            imported=0,
            matched=matched,
            created_matches=created_matches,
            unmatched=len(predictions) - matched - created_matches,
        )

    unmatched = len(predictions) - matched - created_matches
    return ForebetImportOutcome(
        status="ok",
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
    )


def _forebet_url(target_date: date) -> str:
    return f"{FOREBET_PREDICTIONS_URL}?lang=en"


def _is_cloudflare_challenge(html: str) -> bool:
    lowered = html.lower()
    return "just a moment" in lowered and ("cloudflare" in lowered or "cf_chl" in lowered)


def _parse_forebet_predictions(html: str, target_date: date) -> list[ForebetSourcePrediction]:
    soup = BeautifulSoup(html, "html.parser")
    predictions: list[ForebetSourcePrediction] = []
    for row in soup.select("tr"):
        cells = [cell.get_text(" ", strip=True) for cell in row.select("th,td") if cell.get_text(" ", strip=True)]
        item = _prediction_from_cells(cells, target_date)
        if item:
            predictions.append(item)
    return predictions


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
