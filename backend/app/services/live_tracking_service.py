from sqlalchemy.orm import Session

from app.models import Match
from app.schemas.config import LiveTrackingSettings
from app.services.config_service import get_statistical_config, update_statistical_config


def get_live_tracking_settings(db: Session) -> LiveTrackingSettings:
    return get_statistical_config(db).value.live_tracking


def update_live_tracking_settings(db: Session, live_tracking: LiveTrackingSettings) -> LiveTrackingSettings:
    settings = get_statistical_config(db).value
    settings.live_tracking = _normalize(live_tracking)
    update_statistical_config(db, settings)
    return settings.live_tracking


def set_global_tracking(db: Session, enabled: bool) -> LiveTrackingSettings:
    settings = get_statistical_config(db).value
    settings.live_tracking.follow_all_by_default = enabled
    update_statistical_config(db, settings)
    return settings.live_tracking


def set_match_tracking(db: Session, match_id: int, enabled: bool) -> LiveTrackingSettings | None:
    if not db.get(Match, match_id):
        return None

    settings = get_statistical_config(db).value
    tracked = set(settings.live_tracking.tracked_match_ids)
    if enabled:
        tracked.add(match_id)
    else:
        tracked.discard(match_id)
    settings.live_tracking.tracked_match_ids = sorted(tracked)
    update_statistical_config(db, settings)
    return settings.live_tracking


def _normalize(live_tracking: LiveTrackingSettings) -> LiveTrackingSettings:
    live_tracking.tracked_match_ids = sorted(set(live_tracking.tracked_match_ids))
    live_tracking.refresh_seconds = max(600, live_tracking.refresh_seconds)
    if live_tracking.alert_level not in {"conservador", "normal", "agresivo"}:
        live_tracking.alert_level = "normal"
    return live_tracking
