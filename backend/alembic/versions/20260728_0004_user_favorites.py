"""add user favorites

Revision ID: 20260728_0004
Revises: 20260727_0003
Create Date: 2026-07-28 15:30:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260728_0004"
down_revision: str | None = "20260727_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "user_favorite" in inspector.get_table_names():
        return
    op.create_table(
        "user_favorite",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_key", sa.String(length=120), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=180), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_key", "entity_type", "entity_id", name="uq_user_favorite_entity"),
    )
    op.create_index("ix_user_favorite_user_key", "user_favorite", ["user_key"])
    op.create_index("ix_user_favorite_entity_type", "user_favorite", ["entity_type"])
    op.create_index("ix_user_favorite_entity_id", "user_favorite", ["entity_id"])


def downgrade() -> None:
    op.drop_index("ix_user_favorite_entity_id", table_name="user_favorite")
    op.drop_index("ix_user_favorite_entity_type", table_name="user_favorite")
    op.drop_index("ix_user_favorite_user_key", table_name="user_favorite")
    op.drop_table("user_favorite")
