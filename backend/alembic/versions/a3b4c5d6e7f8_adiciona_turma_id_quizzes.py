"""adiciona turma_id em quizzes

Revision ID: a3b4c5d6e7f8
Revises: f2a1b2c3d4e5
Create Date: 2026-09-12 20:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, Sequence[str], None] = 'f2a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('quizzes', sa.Column('turma_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_quizzes_turma_id'), 'quizzes', ['turma_id'], unique=False)
    op.create_foreign_key('fk_quizzes_turma_id', 'quizzes', 'turmas', ['turma_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_quizzes_turma_id', 'quizzes', type_='foreignkey')
    op.drop_index(op.f('ix_quizzes_turma_id'), table_name='quizzes')
    op.drop_column('quizzes', 'turma_id')
