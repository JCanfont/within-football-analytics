from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.database import Base, engine
import app.models  # noqa: F401 - ensure metadata is populated


def ensure_schema(target_engine: Engine | None = None) -> None:
    """Apply lightweight additive migrations for serverless/SQLite deploys."""
    bind = target_engine or engine
    Base.metadata.create_all(bind=bind)
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "match" not in tables:
        return

    existing = {column["name"] for column in inspector.get_columns("match")}
    additions = {
        "home_ht_score": "INTEGER",
        "away_ht_score": "INTEGER",
        "home_shots": "INTEGER",
        "away_shots": "INTEGER",
        "home_shots_on_target": "INTEGER",
        "away_shots_on_target": "INTEGER",
        "home_yellow_cards": "INTEGER",
        "away_yellow_cards": "INTEGER",
        "home_red_cards": "INTEGER",
        "away_red_cards": "INTEGER",
        "home_odds": "NUMERIC(8,3)",
        "draw_odds": "NUMERIC(8,3)",
        "away_odds": "NUMERIC(8,3)",
        "odds_source": "VARCHAR(80)",
    }
    dialect = bind.dialect.name
    with bind.begin() as connection:
        for column_name, column_type in additions.items():
            if column_name in existing:
                continue
            # SQLite/Postgres both accept these simple ALTER TABLE ADD COLUMN forms.
            connection.execute(text(f'ALTER TABLE "match" ADD COLUMN {column_name} {column_type}'))
            if dialect == "postgresql":
                pass
