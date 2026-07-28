from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.config import LiveTrackingSettings
from app.services.forebet_importer import import_forebet_jornada
from app.services.live_tracking_service import (
    get_live_tracking_settings,
    set_global_tracking,
    set_match_tracking,
    update_live_tracking_settings,
)


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
