"""adiciona modo_atualizado_em em aulas

Revision ID: 1a00a2254a6b
Revises: f2a1b2c3d4e5
Create Date: 2026-09-12 21:22:42.938178

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '1a00a2254a6b'
down_revision: Union[str, Sequence[str], None] = 'f2a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("aulas", sa.Column("modo_atualizado_em", sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("aulas", "modo_atualizado_em")
