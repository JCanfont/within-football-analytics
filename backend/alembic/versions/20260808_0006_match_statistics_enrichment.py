"""enrich matches with shots, cards, odds, HT and incident tables

Revision ID: 20260808_0006
Revises: 20260728_0005
Create Date: 2026-08-08 09:20:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260808_0006"
down_revision: str | None = "20260728_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    match_columns = {column["name"] for column in inspector.get_columns("match")} if "match" in inspector.get_table_names() else set()
    additions = {
        "home_ht_score": sa.Column("home_ht_score", sa.Integer(), nullable=True),
        "away_ht_score": sa.Column("away_ht_score", sa.Integer(), nullable=True),
        "home_shots": sa.Column("home_shots", sa.Integer(), nullable=True),
        "away_shots": sa.Column("away_shots", sa.Integer(), nullable=True),
        "home_shots_on_target": sa.Column("home_shots_on_target", sa.Integer(), nullable=True),
        "away_shots_on_target": sa.Column("away_shots_on_target", sa.Integer(), nullable=True),
        "home_yellow_cards": sa.Column("home_yellow_cards", sa.Integer(), nullable=True),
        "away_yellow_cards": sa.Column("away_yellow_cards", sa.Integer(), nullable=True),
        "home_red_cards": sa.Column("home_red_cards", sa.Integer(), nullable=True),
        "away_red_cards": sa.Column("away_red_cards", sa.Integer(), nullable=True),
        "home_odds": sa.Column("home_odds", sa.Numeric(8, 3), nullable=True),
        "draw_odds": sa.Column("draw_odds", sa.Numeric(8, 3), nullable=True),
        "away_odds": sa.Column("away_odds", sa.Numeric(8, 3), nullable=True),
        "odds_source": sa.Column("odds_source", sa.String(length=80), nullable=True),
    }
    for name, column in additions.items():
        if name not in match_columns:
            op.add_column("match", column)

    tables = set(inspector.get_table_names())
    if "match_incident" not in tables:
        op.create_table(
            "match_incident",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("match_id", sa.Integer(), sa.ForeignKey("match.id"), nullable=False),
            sa.Column("team_id", sa.Integer(), sa.ForeignKey("team.id"), nullable=True),
            sa.Column("incident_type", sa.String(length=40), nullable=False),
            sa.Column("minute", sa.Integer(), nullable=False),
            sa.Column("player_name", sa.String(length=180), nullable=True),
            sa.Column("detail", sa.String(length=240), nullable=True),
            sa.Column("source", sa.String(length=80), nullable=True),
            sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint(
                "match_id",
                "incident_type",
                "minute",
                "team_id",
                "player_name",
                "source",
                name="uq_match_incident_identity",
            ),
        )
        op.create_index("ix_match_incident_match_id", "match_incident", ["match_id"])
        op.create_index("ix_match_incident_incident_type", "match_incident", ["incident_type"])

    if "live_match_observation" not in tables:
        op.create_table(
            "live_match_observation",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("provider", sa.String(length=80), nullable=False),
            sa.Column("provider_event_id", sa.Integer(), nullable=False),
            sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("minute", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=False),
            sa.Column("home_team", sa.String(length=180), nullable=False),
            sa.Column("away_team", sa.String(length=180), nullable=False),
            sa.Column("competition", sa.String(length=180), nullable=True),
            sa.Column("home_score", sa.Integer(), nullable=True),
            sa.Column("away_score", sa.Integer(), nullable=True),
            sa.Column("home_shots_on_target", sa.Integer(), nullable=True),
            sa.Column("away_shots_on_target", sa.Integer(), nullable=True),
            sa.Column("home_shots", sa.Integer(), nullable=True),
            sa.Column("away_shots", sa.Integer(), nullable=True),
            sa.UniqueConstraint("provider_event_id", "observed_at", name="uq_live_match_observation_event_time"),
        )
        op.create_index("ix_live_match_observation_provider_event_id", "live_match_observation", ["provider_event_id"])
        op.create_index("ix_live_match_observation_observed_at", "live_match_observation", ["observed_at"])


def downgrade() -> None:
    op.drop_table("live_match_observation")
    op.drop_table("match_incident")
    for column_name in (
        "odds_source",
        "away_odds",
        "draw_odds",
        "home_odds",
        "away_red_cards",
        "home_red_cards",
        "away_yellow_cards",
        "home_yellow_cards",
        "away_shots_on_target",
        "home_shots_on_target",
        "away_shots",
        "home_shots",
        "away_ht_score",
        "home_ht_score",
    ):
        op.drop_column("match", column_name)
