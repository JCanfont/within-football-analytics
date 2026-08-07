from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_DATABASE_URL = f"sqlite:///{(Path(__file__).resolve().parents[1] / 'within_football_analytics.db').as_posix()}"


class Settings(BaseSettings):
    app_name: str = Field(default="within-football-analytics", alias="APP_NAME")
    environment: str = Field(default="development", alias="ENVIRONMENT")
    database_url: str = Field(default=DEFAULT_DATABASE_URL, alias="DATABASE_URL")
    sql_echo: bool = Field(default=False, alias="SQL_ECHO")
    sofascore_live_url_template: str | None = Field(default=None, alias="SOFASCORE_LIVE_URL_TEMPLATE")
    sofascore_api_token: str | None = Field(default=None, alias="SOFASCORE_API_TOKEN")
    crawlora_api_key: str | None = Field(default=None, alias="CRAWLORA_API_KEY")
    transfermarkt_squad_url_template: str | None = Field(default=None, alias="TRANSFERMARKT_SQUAD_URL_TEMPLATE")
    transfermarkt_api_token: str | None = Field(default=None, alias="TRANSFERMARKT_API_TOKEN")
    resend_api_key: str | None = Field(default=None, alias="RESEND_API_KEY")
    forebet_alert_email: str | None = Field(default=None, alias="FOREBET_ALERT_EMAIL")
    forebet_alert_from: str = Field(default="WITHIN Football Alerts <onboarding@resend.dev>", alias="FOREBET_ALERT_FROM")
    rapidapi_key: str | None = Field(default=None, alias="RAPIDAPI_KEY")
    flashscore_api_host: str = Field(default="flashscore4.p.rapidapi.com", alias="FLASHSCORE_API_HOST")
    cron_secret: str | None = Field(default=None, alias="CRON_SECRET")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
