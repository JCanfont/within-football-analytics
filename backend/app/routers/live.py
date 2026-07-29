from datetime import date, datetime

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.api import (
    LiveMatchSnapshot,
    LiveProviderStatus,
    SofaScoreEventComparison,
    SofaScoreLiveEventsResult,
    SofaScoreStoredEventsResult,
    SofaScoreTeamEventsResult,
)
from app.schemas.config import LiveTrackingSettings
from app.services.forebet_importer import import_forebet_jornada
from app.services.live_tracking_service import (
    get_live_tracking_settings,
    set_global_tracking,
    set_match_tracking,
    update_live_tracking_settings,
)
from app.services.sofascore_live_provider import fetch_match_snapshot, provider_status
from app.services.sofascore_crawlora_provider import (
    fetch_event_snapshot as fetch_crawlora_event_snapshot,
    fetch_live_events as fetch_crawlora_live_events,
    fetch_team_events as fetch_crawlora_team_events,
    provider_status as crawlora_provider_status,
)
from app.services.sofascore_live_comparison import build_sofascore_event_comparison
from app.services.sofascore_interest import live_only, mark_forebet_interest_matches
from app.services.sofascore_match_store import store_sofascore_events


router = APIRouter(prefix="/api/live", tags=["live"])


class TrackingToggle(BaseModel):
    enabled: bool


@router.get("/tracking", response_model=LiveTrackingSettings)
def get_tracking_settings(db: Session = Depends(get_db)) -> LiveTrackingSettings:
    return get_live_tracking_settings(db)


@router.put("/tracking", response_model=LiveTrackingSettings)
def update_tracking_settings(settings: LiveTrackingSettings, db: Session = Depends(get_db)) -> LiveTrackingSettings:
    return update_live_tracking_settings(db, settings)


@router.put("/tracking/global", response_model=LiveTrackingSettings)
def update_global_tracking(payload: TrackingToggle, db: Session = Depends(get_db)) -> LiveTrackingSettings:
    return set_global_tracking(db, payload.enabled)


@router.put("/tracking/matches/{match_id}", response_model=LiveTrackingSettings)
def update_match_tracking(match_id: int, payload: TrackingToggle, db: Session = Depends(get_db)) -> LiveTrackingSettings:
    settings = set_match_tracking(db, match_id, payload.enabled)
    if not settings:
        raise HTTPException(status_code=404, detail="Match not found")
    return settings


@router.get("/forebet/tick")
def tick_forebet_results(target_date: date | None = None, db: Session = Depends(get_db)) -> dict:
    target_date = target_date or datetime.now().date()
    outcome = import_forebet_jornada(db, target_date)
    return {
        "status": outcome.status,
        "target_date": target_date.isoformat(),
        "fetched": outcome.fetched,
        "matched": outcome.matched,
        "created_matches": outcome.created_matches,
        "imported": outcome.imported,
        "message": outcome.message,
    }


@router.get("/provider-status", response_model=LiveProviderStatus)
def get_live_provider_status() -> LiveProviderStatus:
    crawlora_status = crawlora_provider_status()
    if crawlora_status.configured:
        return crawlora_status
    return provider_status()


@router.get("/sofascore/matches/{match_id}/snapshot", response_model=LiveMatchSnapshot)
def get_sofascore_match_snapshot(match_id: int, db: Session = Depends(get_db)) -> LiveMatchSnapshot:
    snapshot = fetch_match_snapshot(db, match_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Match not found")
    return snapshot


@router.get("/sofascore/teams/{team_id}/events", response_model=SofaScoreTeamEventsResult)
def get_sofascore_team_events(team_id: int, direction: str = "next", page: int = 0) -> SofaScoreTeamEventsResult:
    try:
        result = fetch_crawlora_team_events(team_id, direction, page)
        result.events = live_only(result.events)
        result.message = f"{len(result.events)} eventos en directo SofaScore encontrados."
        return result
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail="El proveedor SofaScore no pudo devolver eventos para ese equipo.") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/sofascore/teams/{team_id}/events/store", response_model=SofaScoreStoredEventsResult)
def store_sofascore_team_events(
    team_id: int,
    direction: str = "next",
    page: int = 0,
    db: Session = Depends(get_db),
) -> SofaScoreStoredEventsResult:
    try:
        result = fetch_crawlora_team_events(team_id, direction, page)
        result.events = mark_forebet_interest_matches(db, live_only(result.events))
        stored = store_sofascore_events(db, result.events)
        return SofaScoreStoredEventsResult(
            provider=result.provider,
            sport="football",
            events=result.events,
            message=(
                f"SofaScore: {stored['processed']} eventos procesados, {stored['created']} nuevos, "
                f"{stored['updated']} actualizados. Total partidos: {stored['total_matches']}."
            ),
            **stored,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail="El proveedor SofaScore no pudo devolver eventos para ese equipo.") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/sofascore/live-events", response_model=SofaScoreLiveEventsResult)
def get_sofascore_live_events(sport: str = "football") -> SofaScoreLiveEventsResult:
    try:
        result = fetch_crawlora_live_events(sport)
        result.events = live_only(result.events)
        result.message = f"{len(result.events)} partidos en directo encontrados en SofaScore."
        return result
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail="El proveedor SofaScore no pudo devolver partidos en directo.") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/sofascore/live-events/store", response_model=SofaScoreStoredEventsResult)
def store_sofascore_live_events(sport: str = "football", db: Session = Depends(get_db)) -> SofaScoreStoredEventsResult:
    try:
        result = fetch_crawlora_live_events(sport)
        result.events = mark_forebet_interest_matches(db, live_only(result.events))
        stored = store_sofascore_events(db, result.events)
        return SofaScoreStoredEventsResult(
            provider=result.provider,
            sport=result.sport,
            events=result.events,
            message=(
                f"SofaScore: {stored['processed']} directos procesados, {stored['created']} nuevos, "
                f"{stored['updated']} actualizados. Total partidos: {stored['total_matches']}."
            ),
            **stored,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail="El proveedor SofaScore no pudo devolver partidos en directo.") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/sofascore/events/{event_id}/snapshot", response_model=LiveMatchSnapshot)
def get_sofascore_event_snapshot(event_id: int) -> LiveMatchSnapshot:
    try:
        return fetch_crawlora_event_snapshot(event_id)
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail="El proveedor SofaScore no pudo devolver el evento seleccionado.") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/sofascore/events/{event_id}/comparison", response_model=SofaScoreEventComparison)
def compare_sofascore_event(event_id: int, db: Session = Depends(get_db)) -> SofaScoreEventComparison:
    try:
        live_result = fetch_crawlora_live_events("football")
        event = next((item for item in mark_forebet_interest_matches(db, live_only(live_result.events)) if item.event_id == event_id), None)
        if not event:
            raise HTTPException(status_code=404, detail="SofaScore live event not found")
        store_sofascore_events(db, [event])
        return build_sofascore_event_comparison(db, event)
    except HTTPException:
        raise
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail="El proveedor SofaScore no pudo devolver el evento para comparar.") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
