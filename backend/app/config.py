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

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
