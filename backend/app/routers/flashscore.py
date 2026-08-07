from secrets import compare_digest

from fastapi import APIRouter, Header, HTTPException

from app.config import get_settings
from app.schemas.api import FlashscoreGoalEmailRequest, FlashscoreMatchesResult, FlashscoreTickResult, ForebetStartEmailResult
from app.services.email_alerts import send_flashscore_goal_email
from app.services.flashscore_provider import fetch_flashscore_matches, probe_flashscore_feed


router = APIRouter(prefix="/api/flashscore", tags=["flashscore"])


def _require_cron_authorization(authorization: str | None) -> None:
    settings = get_settings()
    if not settings.cron_secret:
        raise HTTPException(status_code=503, detail="CRON_SECRET no configurado")
    expected = f"Bearer {settings.cron_secret}"
    if not authorization or not compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Cron no autorizado")


@router.get("/matches", response_model=FlashscoreMatchesResult)
def get_flashscore_matches(day: int = 0) -> FlashscoreMatchesResult:
    safe_day = max(-7, min(7, day))
    return fetch_flashscore_matches(safe_day)


@router.post("/goal-alert/email", response_model=ForebetStartEmailResult)
def email_flashscore_goal(payload: FlashscoreGoalEmailRequest) -> ForebetStartEmailResult:
    return send_flashscore_goal_email(payload)


@router.get("/probe")
def probe_flashscore(authorization: str | None = Header(default=None)) -> dict:
    _require_cron_authorization(authorization)
    return probe_flashscore_feed()


@router.get("/tick", response_model=FlashscoreTickResult)
def tick_flashscore_alerts(authorization: str | None = Header(default=None)) -> FlashscoreTickResult:
    _require_cron_authorization(authorization)
    settings = get_settings()

    feed = fetch_flashscore_matches(0, settings)
    if feed.status != "ok":
        return FlashscoreTickResult(
            status=feed.status,
            checked=0,
            eligible=0,
            emails_sent=0,
            message=feed.message,
        )

    eligible = [match for match in feed.matches if match.alert_eligible]
    emails_sent = 0
    for match in eligible:
        if (
            not match.favorite_team
            or match.favorite_odds is None
            or match.minute is None
            or match.home_score is None
            or match.away_score is None
        ):
            continue
        result = send_flashscore_goal_email(
            FlashscoreGoalEmailRequest(
                event_id=match.event_id,
                competition=match.competition,
                home_team=match.home_team,
                away_team=match.away_team,
                favorite_team=match.favorite_team,
                favorite_odds=match.favorite_odds,
                minute=match.minute,
                home_score=match.home_score,
                away_score=match.away_score,
            ),
            settings,
        )
        if result.status == "sent":
            emails_sent += 1

    return FlashscoreTickResult(
        status="ok",
        checked=len(feed.matches),
        eligible=len(eligible),
        emails_sent=emails_sent,
        message=f"{len(feed.matches)} partidos revisados · {len(eligible)} alertas elegibles · {emails_sent} emails nuevos.",
    )
