"""add match feature snapshots

Revision ID: 20260728_0005
Revises: 20260728_0004
Create Date: 2026-07-28 18:55:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260728_0005"
down_revision: str | None = "20260728_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "match_feature_snapshot" in inspector.get_table_names():
        return
    op.create_table(
        "match_feature_snapshot",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("match_id", sa.Integer(), sa.ForeignKey("match.id"), nullable=False),
        sa.Column("schema_version", sa.String(length=40), nullable=False),
        sa.Column("tensor_key", sa.String(length=240), nullable=False),
        sa.Column("competition_id", sa.Integer(), sa.ForeignKey("competition.id"), nullable=False),
        sa.Column("season_id", sa.Integer(), sa.ForeignKey("season.id"), nullable=False),
        sa.Column("matchday", sa.Integer(), nullable=True),
        sa.Column("home_team_id", sa.Integer(), sa.ForeignKey("team.id"), nullable=False),
        sa.Column("away_team_id", sa.Integer(), sa.ForeignKey("team.id"), nullable=False),
        sa.Column("home_goals", sa.Integer(), nullable=True),
        sa.Column("away_goals", sa.Integer(), nullable=True),
        sa.Column("total_goals", sa.Integer(), nullable=True),
        sa.Column("home_position", sa.Integer(), nullable=True),
        sa.Column("away_position", sa.Integer(), nullable=True),
        sa.Column("classification_gap", sa.Integer(), nullable=True),
        sa.Column("home_recent_points", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("away_recent_points", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("home_recent_goal_difference", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("away_recent_goal_difference", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("closed_midtable_index", sa.Numeric(6, 2), nullable=True),
        sa.Column("score_range", sa.JSON(), nullable=True),
        sa.Column("feature_vector", sa.JSON(), nullable=False),
        sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("match_id", "schema_version", name="uq_match_feature_schema"),
    )
    op.create_index("ix_match_feature_snapshot_match_id", "match_feature_snapshot", ["match_id"])
    op.create_index("ix_match_feature_snapshot_tensor_key", "match_feature_snapshot", ["tensor_key"])
    op.create_index("ix_match_feature_snapshot_competition_id", "match_feature_snapshot", ["competition_id"])
    op.create_index("ix_match_feature_snapshot_season_id", "match_feature_snapshot", ["season_id"])
    op.create_index("ix_match_feature_snapshot_home_team_id", "match_feature_snapshot", ["home_team_id"])
    op.create_index("ix_match_feature_snapshot_away_team_id", "match_feature_snapshot", ["away_team_id"])
    op.create_index("ix_match_feature_snapshot_calculated_at", "match_feature_snapshot", ["calculated_at"])


def downgrade() -> None:
    op.drop_index("ix_match_feature_snapshot_calculated_at", table_name="match_feature_snapshot")
    op.drop_index("ix_match_feature_snapshot_away_team_id", table_name="match_feature_snapshot")
    op.drop_index("ix_match_feature_snapshot_home_team_id", table_name="match_feature_snapshot")
    op.drop_index("ix_match_feature_snapshot_season_id", table_name="match_feature_snapshot")
    op.drop_index("ix_match_feature_snapshot_competition_id", table_name="match_feature_snapshot")
    op.drop_index("ix_match_feature_snapshot_tensor_key", table_name="match_feature_snapshot")
    op.drop_index("ix_match_feature_snapshot_match_id", table_name="match_feature_snapshot")
    op.drop_table("match_feature_snapshot")
