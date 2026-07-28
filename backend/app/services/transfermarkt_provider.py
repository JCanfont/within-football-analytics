from __future__ import annotations

from datetime import UTC, date, datetime
from string import Formatter
from urllib.parse import quote

import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Player, PlayerTeamHistory, Season, Team
from app.schemas.api import TeamSquadPlayerRead, TeamSquadRead
from app.utils.normalization import normalize_name


PROVIDER_NAME = "transfermarkt"


def provider_status() -> dict:
    configured = bool(get_settings().transfermarkt_squad_url_template)
    return {
        "provider": PROVIDER_NAME,
        "status": "ready" if configured else "provider_not_configured",
        "configured": configured,
        "message": (
            "Proveedor Transfermarkt configurado para plantilla autorizada."
            if configured
            else "Falta configurar TRANSFERMARKT_SQUAD_URL_TEMPLATE con un feed/API autorizado."
        ),
    }


def get_team_squad(db: Session, team_id: int) -> TeamSquadRead | None:
    team = db.get(Team, team_id)
    if not team:
        return None
    players = _local_squad_players(db, team)
    return TeamSquadRead(
        team_id=team.id,
        team=team.name,
        provider=PROVIDER_NAME,
        status="ok" if players else "empty",
        message="Plantilla local cargada." if players else "No hay plantilla local importada para este equipo.",
        imported=0,
        players=players,
    )


def import_team_squad(db: Session, team_id: int) -> TeamSquadRead | None:
    team = db.get(Team, team_id)
    if not team:
        return None
    settings = get_settings()
    if not settings.transfermarkt_squad_url_template:
        local = _local_squad_players(db, team)
        return TeamSquadRead(
            team_id=team.id,
            team=team.name,
            provider=PROVIDER_NAME,
            status="provider_not_configured",
            message="Falta configurar TRANSFERMARKT_SQUAD_URL_TEMPLATE con un feed/API autorizado.",
            imported=0,
            players=local,
        )

    url = _build_url(settings.transfermarkt_squad_url_template, team)
    headers = {"Accept": "application/json", "User-Agent": "within-football-analytics/1.0"}
    if settings.transfermarkt_api_token:
        headers["Authorization"] = f"Bearer {settings.transfermarkt_api_token}"

    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        return _error_result(db, team, "request_failed", f"No se pudo consultar Transfermarkt autorizado: {exc}")
    except ValueError:
        return _error_result(db, team, "invalid_response", "El proveedor respondio, pero no devolvio JSON valido.")

    season = _current_or_latest_season(db)
    if not season:
        return _error_result(db, team, "season_missing", "No hay temporadas cargadas para vincular la plantilla.")

    imported = 0
    for row in _players_from_payload(payload):
        player = _upsert_player(db, row)
        if not player:
            continue
        _upsert_team_history(db, player, team, season, row)
        imported += 1
    db.commit()

    return TeamSquadRead(
        team_id=team.id,
        team=team.name,
        provider=PROVIDER_NAME,
        status="ok",
        message=f"Plantilla importada desde proveedor autorizado: {imported} jugadores procesados.",
        imported=imported,
        players=_local_squad_players(db, team),
    )


def _build_url(template: str, team: Team) -> str:
    values = {
        "team_id": team.id,
        "team_name": team.name,
        "team_name_q": quote(team.name),
        "external_id": team.external_id or "",
        "normalized_name": team.normalized_name,
    }
    required = {field_name for _, field_name, _, _ in Formatter().parse(template) if field_name}
    safe_values = {key: values.get(key, "") for key in required}
    return template.format(**safe_values)


def _players_from_payload(payload: object) -> list[dict]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("players", "squad", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]
        if isinstance(value, dict):
            nested = value.get("players") or value.get("squad")
            if isinstance(nested, list):
                return [row for row in nested if isinstance(row, dict)]
    return []


def _upsert_player(db: Session, row: dict) -> Player | None:
    full_name = str(_pick(row, "full_name", "name", "player.name") or "").strip()
    if not full_name:
        return None
    external_id = _optional_str(_pick(row, "external_id", "id", "player.id"))
    player = db.scalar(select(Player).where(Player.external_id == f"transfermarkt:{external_id}")) if external_id else None
    if not player:
        player = db.scalar(select(Player).where(Player.normalized_name == normalize_name(full_name)))
    if player:
        player.full_name = full_name
        player.nationality = _optional_str(_pick(row, "nationality", "country")) or player.nationality
        player.primary_position = _optional_str(_pick(row, "primary_position", "position")) or player.primary_position
        player.external_id = player.external_id or (f"transfermarkt:{external_id}" if external_id else None)
        return player
    player = Player(
        full_name=full_name,
        normalized_name=normalize_name(full_name),
        date_of_birth=_parse_date(_pick(row, "date_of_birth", "birth_date")),
        nationality=_optional_str(_pick(row, "nationality", "country")),
        primary_position=_optional_str(_pick(row, "primary_position", "position")),
        external_id=f"transfermarkt:{external_id}" if external_id else None,
    )
    db.add(player)
    db.flush()
    return player


def _upsert_team_history(db: Session, player: Player, team: Team, season: Season, row: dict) -> PlayerTeamHistory:
    start_date = _parse_date(_pick(row, "start_date", "joined")) or season.start_date or date(datetime.now(UTC).year, 7, 1)
    history = db.scalar(
        select(PlayerTeamHistory).where(
            PlayerTeamHistory.player_id == player.id,
            PlayerTeamHistory.team_id == team.id,
            PlayerTeamHistory.season_id == season.id,
            PlayerTeamHistory.start_date == start_date,
        )
    )
    if not history:
        history = PlayerTeamHistory(player_id=player.id, team_id=team.id, season_id=season.id, start_date=start_date)
        db.add(history)
    history.end_date = _parse_date(_pick(row, "end_date", "contract_until"))
    history.shirt_number = _parse_int(_pick(row, "shirt_number", "number"))
    return history


def _local_squad_players(db: Session, team: Team) -> list[TeamSquadPlayerRead]:
    rows = db.execute(
        select(Player, PlayerTeamHistory)
        .join(PlayerTeamHistory, PlayerTeamHistory.player_id == Player.id)
        .where(PlayerTeamHistory.team_id == team.id)
        .order_by(PlayerTeamHistory.shirt_number.is_(None), PlayerTeamHistory.shirt_number, Player.full_name)
    ).all()
    return [
        TeamSquadPlayerRead(
            id=player.id,
            full_name=player.full_name,
            nationality=player.nationality,
            primary_position=player.primary_position,
            shirt_number=history.shirt_number,
            date_of_birth=player.date_of_birth,
            source="local",
        )
        for player, history in rows
    ]


def _current_or_latest_season(db: Session) -> Season | None:
    return db.scalar(select(Season).order_by(Season.is_current.desc(), Season.start_date.desc().nullslast(), Season.id.desc()).limit(1))


def _error_result(db: Session, team: Team, status: str, message: str) -> TeamSquadRead:
    return TeamSquadRead(
        team_id=team.id,
        team=team.name,
        provider=PROVIDER_NAME,
        status=status,
        message=message,
        imported=0,
        players=_local_squad_players(db, team),
    )


def _pick(payload: dict, *paths: str) -> object | None:
    for path in paths:
        current: object = payload
        for part in path.split("."):
            if not isinstance(current, dict) or part not in current:
                current = None
                break
            current = current[part]
        if current is not None:
            return current
    return None


def _optional_str(value: object | None) -> str | None:
    if value in (None, ""):
        return None
    return str(value).strip()


def _parse_date(value: object | None) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _parse_int(value: object | None) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
