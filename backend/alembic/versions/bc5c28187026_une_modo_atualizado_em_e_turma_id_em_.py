"""une modo_atualizado_em e turma_id em quizzes

Revision ID: bc5c28187026
Revises: 1a00a2254a6b, a3b4c5d6e7f8
Create Date: 2026-09-12 22:13:51.062294

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'bc5c28187026'
down_revision: Union[str, Sequence[str], None] = ('1a00a2254a6b', 'a3b4c5d6e7f8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
