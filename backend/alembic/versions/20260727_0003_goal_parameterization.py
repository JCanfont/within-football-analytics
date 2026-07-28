"""add goal parameterization match metadata

Revision ID: 20260727_0003
Revises: a8544894009f
Create Date: 2026-07-27 16:35:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260727_0003"
down_revision: str | None = "a8544894009f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    competition_columns = {column["name"] for column in inspector.get_columns("competition")}
    match_columns = {column["name"] for column in inspector.get_columns("match")}
    if "competition_type" not in competition_columns:
        op.add_column("competition", sa.Column("competition_type", sa.String(length=40), nullable=True))
    if "is_friendly" not in match_columns:
        op.add_column("match", sa.Column("is_friendly", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("match", "is_friendly")
    op.drop_column("competition", "competition_type")
