from html import escape

import requests

from app.config import Settings, get_settings
from app.schemas.api import FlashscoreGoalEmailRequest, ForebetStartEmailRequest, ForebetStartEmailResult


RESEND_EMAIL_URL = "https://api.resend.com/emails"


def forebet_email_status(settings: Settings | None = None) -> ForebetStartEmailResult:
    settings = settings or get_settings()
    configured = bool(settings.resend_api_key and settings.forebet_alert_email)
    return ForebetStartEmailResult(
        configured=configured,
        sent=False,
        status="configured" if configured else "not_configured",
        message="Avisos por email configurados." if configured else "Faltan RESEND_API_KEY o FOREBET_ALERT_EMAIL.",
    )


def send_forebet_start_email(
    payload: ForebetStartEmailRequest,
    settings: Settings | None = None,
) -> ForebetStartEmailResult:
    settings = settings or get_settings()
    if not settings.resend_api_key or not settings.forebet_alert_email:
        return ForebetStartEmailResult(
            configured=False,
            sent=False,
            status="not_configured",
            message="El aviso por email necesita RESEND_API_KEY y FOREBET_ALERT_EMAIL.",
        )

    score = (
        f"{payload.home_score}-{payload.away_score}"
        if payload.home_score is not None and payload.away_score is not None
        else "marcador pendiente"
    )
    competition = payload.competition or "Competicion no indicada"
    over_under = payload.over_under or "Sin señal Over/Under"
    subject = f"Iniciado: {payload.home_team} - {payload.away_team}"
    html = (
        "<h2>Partido iniciado</h2>"
        f"<p><strong>{escape(payload.home_team)} - {escape(payload.away_team)}</strong></p>"
        f"<p>Resultado actual: <strong>{escape(score)}</strong></p>"
        f"<p>{escape(competition)} · {escape(over_under)}</p>"
        f"<p>Inicio previsto: {escape(payload.match_date.isoformat())}</p>"
    )
    return _deliver_email(subject, html, "Aviso de inicio enviado por email.", settings)


def send_flashscore_goal_email(
    payload: FlashscoreGoalEmailRequest,
    settings: Settings | None = None,
) -> ForebetStartEmailResult:
    settings = settings or get_settings()
    subject = f"Gol antes del 30: {payload.favorite_team} ({payload.favorite_odds:.2f})"
    html = (
        "<h2>Alerta Flashscore</h2>"
        f"<p><strong>{escape(payload.home_team)} {payload.home_score}-{payload.away_score} {escape(payload.away_team)}</strong></p>"
        f"<p>{escape(payload.favorite_team)} tenia cuota <strong>{payload.favorite_odds:.2f}</strong> "
        f"y ha marcado antes del minuto 30.</p>"
        f"<p>Minuto detectado: {payload.minute} · {escape(payload.competition)}</p>"
        f"<p>Evento Flashscore: {escape(payload.event_id)}</p>"
    )
    return _deliver_email(subject, html, "Alerta Flashscore enviada por email.", settings)


def _deliver_email(
    subject: str,
    html: str,
    success_message: str,
    settings: Settings,
) -> ForebetStartEmailResult:
    if not settings.resend_api_key or not settings.forebet_alert_email:
        return ForebetStartEmailResult(
            configured=False,
            sent=False,
            status="not_configured",
            message="El aviso por email necesita RESEND_API_KEY y FOREBET_ALERT_EMAIL.",
        )
    try:
        response = requests.post(
            RESEND_EMAIL_URL,
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": settings.forebet_alert_from,
                "to": [settings.forebet_alert_email],
                "subject": subject,
                "html": html,
            },
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException:
        return ForebetStartEmailResult(
            configured=True,
            sent=False,
            status="provider_error",
            message="No se pudo enviar el aviso por email en este intento.",
        )

    return ForebetStartEmailResult(
        configured=True,
        sent=True,
        status="sent",
        message=success_message,
    )
