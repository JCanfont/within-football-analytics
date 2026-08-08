from __future__ import annotations

import os
import shutil
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def _sqlite_path_from_url(database_url: str) -> Path | None:
    if not database_url.startswith("sqlite:///"):
        return None
    raw = database_url.removeprefix("sqlite:///")
    path = Path(raw)
    if not path.is_absolute():
        path = (Path(__file__).resolve().parents[1] / path).resolve()
    return path


def resolve_database_url(database_url: str) -> str:
    """On Vercel, copy packaged SQLite to /tmp so schema migrations can run."""
    sqlite_path = _sqlite_path_from_url(database_url)
    if sqlite_path is None:
        return database_url

    running_on_vercel = bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV"))
    if not running_on_vercel:
        return database_url

    writable = Path("/tmp/within_football_analytics.db")
    try:
        if sqlite_path.exists():
            if (not writable.exists()) or writable.stat().st_mtime < sqlite_path.stat().st_mtime or writable.stat().st_size != sqlite_path.stat().st_size:
                shutil.copy2(sqlite_path, writable)
        elif not writable.exists():
            writable.touch()
    except OSError:
        # Fall back to the original URL if /tmp is unavailable.
        return database_url
    return f"sqlite:///{writable.as_posix()}"


settings = get_settings()
DATABASE_URL = resolve_database_url(settings.database_url)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=settings.sql_echo, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
