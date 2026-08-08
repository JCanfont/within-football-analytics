from secrets import compare_digest

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.schemas.api import (
    FlashscoreGoalEmailRequest,
    FlashscoreMatchesResult,
    FlashscoreTickResult,
    FlashscoreWatchState,
    FlashscoreWatchUpsertRequest,
    ForebetStartEmailResult,
)
from app.services.email_alerts import send_flashscore_goal_email
from app.services.flashscore_provider import fetch_flashscore_matches
from app.services.flashscore_watch import (
    clear_flashscore_watch,
    load_flashscore_watch,
    run_flashscore_signal_tick,
    save_flashscore_watch,
)


router = APIRouter(prefix="/api/flashscore", tags=["flashscore"])


@router.get("/matches", response_model=FlashscoreMatchesResult)
def get_flashscore_matches(day: int = 0) -> FlashscoreMatchesResult:
    safe_day = max(-7, min(7, day))
    return fetch_flashscore_matches(safe_day)


@router.get("/watch", response_model=FlashscoreWatchState)
def get_flashscore_watch(db: Session = Depends(get_db)) -> FlashscoreWatchState:
    watch = load_flashscore_watch(db)
    if watch is None:
        return FlashscoreWatchState(message="No hay lista vigilada guardada en servidor.")
    return watch.model_copy(
        update={"message": f"{len(watch.matches)} partidos vigilados en servidor para señales en segundo plano."}
    )


@router.put("/watch", response_model=FlashscoreWatchState)
def put_flashscore_watch(
    payload: FlashscoreWatchUpsertRequest,
    db: Session = Depends(get_db),
) -> FlashscoreWatchState:
    watch = save_flashscore_watch(
        db,
        day=payload.day,
        captured_at=payload.captured_at,
        matches=payload.matches,
    )
    return watch.model_copy(
        update={
            "message": (
                f"{len(watch.matches)} partidos guardados en servidor. "
                "El tick usara SofaScore (sin RapidAPI) para avisar a tiempo."
            )
        }
    )


@router.delete("/watch", response_model=FlashscoreWatchState)
def delete_flashscore_watch(db: Session = Depends(get_db)) -> FlashscoreWatchState:
    clear_flashscore_watch(db)
    return FlashscoreWatchState(message="Lista vigilada borrada del servidor.")


@router.post("/goal-alert/email", response_model=ForebetStartEmailResult)
def email_flashscore_goal(payload: FlashscoreGoalEmailRequest) -> ForebetStartEmailResult:
    return send_flashscore_goal_email(payload)


@router.get("/tick", response_model=FlashscoreTickResult)
def tick_flashscore_alerts(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> FlashscoreTickResult:
    settings = get_settings()
    if not settings.cron_secret:
        raise HTTPException(status_code=503, detail="CRON_SECRET no configurado")
    expected = f"Bearer {settings.cron_secret}"
    if not authorization or not compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Cron no autorizado")
    return run_flashscore_signal_tick(db, settings)
