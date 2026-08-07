from fastapi import APIRouter

from app.schemas.api import FlashscoreGoalEmailRequest, FlashscoreMatchesResult, ForebetStartEmailResult
from app.services.email_alerts import send_flashscore_goal_email
from app.services.flashscore_provider import fetch_flashscore_matches


router = APIRouter(prefix="/api/flashscore", tags=["flashscore"])


@router.get("/matches", response_model=FlashscoreMatchesResult)
def get_flashscore_matches(day: int = 0) -> FlashscoreMatchesResult:
    safe_day = max(-7, min(7, day))
    return fetch_flashscore_matches(safe_day)


@router.post("/goal-alert/email", response_model=ForebetStartEmailResult)
def email_flashscore_goal(payload: FlashscoreGoalEmailRequest) -> ForebetStartEmailResult:
    return send_flashscore_goal_email(payload)
