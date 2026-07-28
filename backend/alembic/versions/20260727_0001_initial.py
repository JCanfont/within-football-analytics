"""initial backend schema

Revision ID: 20260727_0001
Revises:
Create Date: 2026-07-27 00:00:00
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260727_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "competition",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("normalized_name", sa.String(length=180), nullable=False),
        sa.Column("country", sa.String(length=100), nullable=True),
        sa.Column("source", sa.String(length=80), nullable=True),
        sa.Column("external_id", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source", "external_id", name="uq_competition_source_external_id"),
    )
    op.create_index(op.f("ix_competition_normalized_name"), "competition", ["normalized_name"], unique=False)

    op.create_table(
        "stadium",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("normalized_name", sa.String(length=180), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=True),
        sa.Column("latitude", sa.Numeric(precision=9, scale=6), nullable=True),
        sa.Column("longitude", sa.Numeric(precision=9, scale=6), nullable=True),
        sa.Column("altitude", sa.Integer(), nullable=True),
        sa.Column("surface_type", sa.String(length=80), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("external_id", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id", name="uq_stadium_external_id"),
    )
    op.create_index(op.f("ix_stadium_normalized_name"), "stadium", ["normalized_name"], unique=False)

    op.create_table(
        "team",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("normalized_name", sa.String(length=180), nullable=False),
        sa.Column("country", sa.String(length=100), nullable=True),
        sa.Column("external_id", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id", name="uq_team_external_id"),
    )
    op.create_index(op.f("ix_team_normalized_name"), "team", ["normalized_name"], unique=False)

    op.create_table(
        "season",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("competition_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("is_current", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["competition_id"], ["competition.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("competition_id", "name", name="uq_season_competition_name"),
    )
    op.create_index(op.f("ix_season_competition_id"), "season", ["competition_id"], unique=False)

    op.create_table(
        "team_alias",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("alias", sa.String(length=180), nullable=False),
        sa.Column("normalized_alias", sa.String(length=180), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["team.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source", "normalized_alias", name="uq_team_alias_source_normalized"),
    )
    op.create_index(op.f("ix_team_alias_normalized_alias"), "team_alias", ["normalized_alias"], unique=False)
    op.create_index(op.f("ix_team_alias_team_id"), "team_alias", ["team_id"], unique=False)

    op.create_table(
        "match",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("competition_id", sa.Integer(), nullable=False),
        sa.Column("season_id", sa.Integer(), nullable=False),
        sa.Column("matchday", sa.Integer(), nullable=True),
        sa.Column("match_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("home_team_id", sa.Integer(), nullable=False),
        sa.Column("away_team_id", sa.Integer(), nullable=False),
        sa.Column("stadium_id", sa.Integer(), nullable=True),
        sa.Column("home_score", sa.Integer(), nullable=True),
        sa.Column("away_score", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=True),
        sa.Column("external_id", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["away_team_id"], ["team.id"]),
        sa.ForeignKeyConstraint(["competition_id"], ["competition.id"]),
        sa.ForeignKeyConstraint(["home_team_id"], ["team.id"]),
        sa.ForeignKeyConstraint(["season_id"], ["season.id"]),
        sa.ForeignKeyConstraint(["stadium_id"], ["stadium.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source", "external_id", name="uq_match_source_external_id"),
    )
    op.create_index(op.f("ix_match_away_team_id"), "match", ["away_team_id"], unique=False)
    op.create_index(op.f("ix_match_competition_id"), "match", ["competition_id"], unique=False)
    op.create_index(op.f("ix_match_home_team_id"), "match", ["home_team_id"], unique=False)
    op.create_index(op.f("ix_match_match_date"), "match", ["match_date"], unique=False)
    op.create_index(op.f("ix_match_season_id"), "match", ["season_id"], unique=False)
    op.create_index(op.f("ix_match_stadium_id"), "match", ["stadium_id"], unique=False)

    op.create_table(
        "standings_snapshot",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("competition_id", sa.Integer(), nullable=False),
        sa.Column("season_id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("matchday", sa.Integer(), nullable=False),
        sa.Column("snapshot_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("played", sa.Integer(), nullable=False),
        sa.Column("won", sa.Integer(), nullable=False),
        sa.Column("drawn", sa.Integer(), nullable=False),
        sa.Column("lost", sa.Integer(), nullable=False),
        sa.Column("goals_for", sa.Integer(), nullable=False),
        sa.Column("goals_against", sa.Integer(), nullable=False),
        sa.Column("goal_difference", sa.Integer(), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["competition_id"], ["competition.id"]),
        sa.ForeignKeyConstraint(["season_id"], ["season.id"]),
        sa.ForeignKeyConstraint(["team_id"], ["team.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("competition_id", "season_id", "team_id", "matchday", "snapshot_date", name="uq_standings_snapshot_identity"),
    )
    op.create_index(op.f("ix_standings_snapshot_competition_id"), "standings_snapshot", ["competition_id"], unique=False)
    op.create_index(op.f("ix_standings_snapshot_season_id"), "standings_snapshot", ["season_id"], unique=False)
    op.create_index(op.f("ix_standings_snapshot_snapshot_date"), "standings_snapshot", ["snapshot_date"], unique=False)
    op.create_index(op.f("ix_standings_snapshot_team_id"), "standings_snapshot", ["team_id"], unique=False)

    op.create_table(
        "forebet_prediction",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("match_id", sa.Integer(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("home_probability", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("draw_probability", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("away_probability", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("prediction", sa.String(length=40), nullable=True),
        sa.Column("predicted_home_score", sa.Integer(), nullable=True),
        sa.Column("predicted_away_score", sa.Integer(), nullable=True),
        sa.Column("expected_goals", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("over_under_prediction", sa.String(length=40), nullable=True),
        sa.Column("both_teams_score_prediction", sa.String(length=40), nullable=True),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(["match_id"], ["match.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("match_id", "captured_at", name="uq_forebet_prediction_capture"),
    )
    op.create_index(op.f("ix_forebet_prediction_captured_at"), "forebet_prediction", ["captured_at"], unique=False)
    op.create_index(op.f("ix_forebet_prediction_match_id"), "forebet_prediction", ["match_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_forebet_prediction_match_id"), table_name="forebet_prediction")
    op.drop_index(op.f("ix_forebet_prediction_captured_at"), table_name="forebet_prediction")
    op.drop_table("forebet_prediction")
    op.drop_index(op.f("ix_standings_snapshot_team_id"), table_name="standings_snapshot")
    op.drop_index(op.f("ix_standings_snapshot_snapshot_date"), table_name="standings_snapshot")
    op.drop_index(op.f("ix_standings_snapshot_season_id"), table_name="standings_snapshot")
    op.drop_index(op.f("ix_standings_snapshot_competition_id"), table_name="standings_snapshot")
    op.drop_table("standings_snapshot")
    op.drop_index(op.f("ix_match_stadium_id"), table_name="match")
    op.drop_index(op.f("ix_match_season_id"), table_name="match")
    op.drop_index(op.f("ix_match_match_date"), table_name="match")
    op.drop_index(op.f("ix_match_home_team_id"), table_name="match")
    op.drop_index(op.f("ix_match_competition_id"), table_name="match")
    op.drop_index(op.f("ix_match_away_team_id"), table_name="match")
    op.drop_table("match")
    op.drop_index(op.f("ix_team_alias_team_id"), table_name="team_alias")
    op.drop_index(op.f("ix_team_alias_normalized_alias"), table_name="team_alias")
    op.drop_table("team_alias")
    op.drop_index(op.f("ix_season_competition_id"), table_name="season")
    op.drop_table("season")
    op.drop_index(op.f("ix_team_normalized_name"), table_name="team")
    op.drop_table("team")
    op.drop_index(op.f("ix_stadium_normalized_name"), table_name="stadium")
    op.drop_table("stadium")
    op.drop_index(op.f("ix_competition_normalized_name"), table_name="competition")
    op.drop_table("competition")
