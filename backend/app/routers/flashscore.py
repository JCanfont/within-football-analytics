from datetime import UTC, datetime
from secrets import compare_digest

from fastapi import APIRouter, Body, Depends, Header, HTTPException
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
from app.services.flashscore_provider import (
    enrich_matches_with_details,
    enrich_matches_with_goal_minutes,
    fetch_flashscore_live_board,
    fetch_flashscore_matches,
)
from app.services.flashscore_watch import (
    clear_flashscore_watch,
    load_flashscore_watch,
    merge_flashscore_live_board,
    run_flashscore_signal_tick,
    save_flashscore_watch,
    with_early_goal_flags,
)


router = APIRouter(prefix="/api/flashscore", tags=["flashscore"])


@router.get("/matches", response_model=FlashscoreMatchesResult)
def get_flashscore_matches(day: int = 0) -> FlashscoreMatchesResult:
    safe_day = max(-7, min(7, day))
    return fetch_flashscore_matches(safe_day)


@router.get("/live-board", response_model=FlashscoreMatchesResult)
def get_flashscore_live_board(day: int = 0) -> FlashscoreMatchesResult:
    """Full Flashscore Ultra board for live minute/score merge into a ≤1.60 watchlist."""
    safe_day = max(-7, min(7, day))
    try:
        board = fetch_flashscore_live_board(safe_day, bypass_cache=True)
    except RuntimeError as exc:
        return FlashscoreMatchesResult(
            status="not_configured",
            message=str(exc),
            configured=False,
        )
    except Exception as exc:  # noqa: BLE001
        return FlashscoreMatchesResult(
            status="request_failed",
            message=f"No se pudo cargar el live board Flashscore: {exc}",
            configured=True,
        )
    return FlashscoreMatchesResult(
        status="ok",
        message=f"Live board Flashscore Ultra: {len(board)} partidos (para fusionar con la lista ≤ 1,60).",
        configured=True,
        matches=board,
    )


@router.post("/watch/refresh", response_model=FlashscoreWatchState)
def refresh_flashscore_watch_live(
    payload: FlashscoreWatchUpsertRequest | None = Body(default=None),
    db: Session = Depends(get_db),
) -> FlashscoreWatchState:
    """Refresh scores/minutes for the ≤1.60 watchlist (body optional; falls back to server watch)."""
    if payload is not None and payload.matches:
        watch = save_flashscore_watch(
            db,
            day=payload.day,
            captured_at=payload.captured_at,
            matches=payload.matches,
        )
    else:
        watch = load_flashscore_watch(db)
    if watch is None or not watch.matches:
        return FlashscoreWatchState(message="No hay lista vigilada en servidor para refrescar.")
    try:
        board = fetch_flashscore_live_board(watch.day, bypass_cache=True)
    except Exception as exc:  # noqa: BLE001
        return watch.model_copy(update={"message": f"No se pudo refrescar con Flashscore Ultra: {exc}"})
    merged = merge_flashscore_live_board(watch.matches, board)
    merged = enrich_matches_with_details(merged)
    merged = [
        with_early_goal_flags(match)
        for match in enrich_matches_with_goal_minutes(merged)
    ]
    saved = save_flashscore_watch(
        db,
        day=watch.day,
        captured_at=watch.captured_at,
        matches=merged,
        last_live_poll_at=datetime.now(UTC),
    )
    with_score = sum(
        1 for match in saved.matches if match.home_score is not None or match.away_score is not None
    )
    with_minute = sum(1 for match in saved.matches if match.minute is not None)
    with_goal_minute = sum(1 for match in saved.matches if match.early_goal_minute is not None)
    return saved.model_copy(
        update={
            "message": (
                f"Flashscore Ultra refresco · {len(saved.matches)} vigilados ≤ 1,60 · "
                f"{with_score} con marcador · {with_minute} con minuto · "
                f"{with_goal_minute} con minuto de gol."
            )
        }
    )


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
                f"{len(watch.matches)} favoritos ≤ 1,60 guardados en servidor. "
                "El tick usa Flashscore Ultra: cada 1 min hasta el 30', luego cada 5 min."
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
