"""adiciona partidas e fase2

Revision ID: f2a1b2c3d4e5
Revises: 02fff720a26e
Create Date: 2026-09-12 15:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'f2a1b2c3d4e5'
down_revision: Union[str, Sequence[str], None] = '02fff720a26e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Alterações em quizzes
    op.add_column('quizzes', sa.Column('professor_id', sa.Integer(), nullable=True))
    op.add_column('quizzes', sa.Column('descricao', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.create_index(op.f('ix_quizzes_professor_id'), 'quizzes', ['professor_id'], unique=False)
    op.create_foreign_key('fk_quizzes_professor_id', 'quizzes', 'professores', ['professor_id'], ['id'])
    op.alter_column('quizzes', 'aula_id', existing_type=sa.Integer(), nullable=True)

    # 2. Alterações em perguntas
    op.add_column('perguntas', sa.Column('pontos', sa.Integer(), nullable=False, server_default='100'))
    op.add_column('perguntas', sa.Column('explicacao', sqlmodel.sql.sqltypes.AutoString(), nullable=True))

    # 3. Criação da tabela partidas
    statuspartida = sa.Enum('em_andamento', 'encerrada', name='statuspartida')
    statuspartida.create(op.get_bind(), checkfirst=True)

    modoexecucaoquiz = sa.Enum('individual', 'grupo', name='modoexecucaoquiz')

    op.create_table(
        'partidas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('aula_id', sa.Integer(), nullable=False),
        sa.Column('quiz_id', sa.Integer(), nullable=False),
        sa.Column('status', statuspartida, nullable=False),
        sa.Column('modo_execucao', modoexecucaoquiz, nullable=False),
        sa.Column('competitivo', sa.Boolean(), nullable=False),
        sa.Column('obrigatorio', sa.Boolean(), nullable=False),
        sa.Column('meta_coletiva_percentual', sa.Integer(), nullable=True),
        sa.Column('tempo_limite_segundos', sa.Integer(), nullable=True),
        sa.Column('discussao_ate', sa.DateTime(), nullable=True),
        sa.Column('expira_em', sa.DateTime(), nullable=True),
        sa.Column('iniciada_em', sa.DateTime(), nullable=False),
        sa.Column('encerrada_em', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['aula_id'], ['aulas.id']),
        sa.ForeignKeyConstraint(['quiz_id'], ['quizzes.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_partidas_aula_id'), 'partidas', ['aula_id'], unique=False)
    op.create_index(op.f('ix_partidas_quiz_id'), 'partidas', ['quiz_id'], unique=False)

    # 4. Alterações em grupos
    op.alter_column('grupos', 'quiz_id', existing_type=sa.Integer(), nullable=True)
    op.add_column('grupos', sa.Column('partida_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_grupos_partida_id'), 'grupos', ['partida_id'], unique=False)
    op.create_foreign_key('fk_grupos_partida_id', 'grupos', 'partidas', ['partida_id'], ['id'])

    # 5. Alterações em respostas
    op.add_column('respostas', sa.Column('partida_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_respostas_partida_id'), 'respostas', ['partida_id'], unique=False)
    op.create_foreign_key('fk_respostas_partida_id', 'respostas', 'partidas', ['partida_id'], ['id'])

    # 6. Criação da tabela partida_pulos
    op.create_table(
        'partida_pulos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('partida_id', sa.Integer(), nullable=False),
        sa.Column('participacao_id', sa.Integer(), nullable=False),
        sa.Column('pulou_em', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['partida_id'], ['partidas.id']),
        sa.ForeignKeyConstraint(['participacao_id'], ['participacoes.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_partida_pulos_partida_id'), 'partida_pulos', ['partida_id'], unique=False)
    op.create_index(op.f('ix_partida_pulos_participacao_id'), 'partida_pulos', ['participacao_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_partida_pulos_participacao_id'), table_name='partida_pulos')
    op.drop_index(op.f('ix_partida_pulos_partida_id'), table_name='partida_pulos')
    op.drop_table('partida_pulos')

    op.drop_constraint('fk_respostas_partida_id', 'respostas', type_='foreignkey')
    op.drop_index(op.f('ix_respostas_partida_id'), table_name='respostas')
    op.drop_column('respostas', 'partida_id')

    op.drop_constraint('fk_grupos_partida_id', 'grupos', type_='foreignkey')
    op.drop_index(op.f('ix_grupos_partida_id'), table_name='grupos')
    op.drop_column('grupos', 'partida_id')
    op.alter_column('grupos', 'quiz_id', existing_type=sa.Integer(), nullable=False)

    op.drop_index(op.f('ix_partidas_quiz_id'), table_name='partidas')
    op.drop_index(op.f('ix_partidas_aula_id'), table_name='partidas')
    op.drop_table('partidas')

    op.drop_column('perguntas', 'explicacao')
    op.drop_column('perguntas', 'pontos')

    op.drop_constraint('fk_quizzes_professor_id', 'quizzes', type_='foreignkey')
    op.drop_index(op.f('ix_quizzes_professor_id'), table_name='quizzes')
    op.drop_column('quizzes', 'descricao')
    op.drop_column('quizzes', 'professor_id')
    op.alter_column('quizzes', 'aula_id', existing_type=sa.Integer(), nullable=False)
