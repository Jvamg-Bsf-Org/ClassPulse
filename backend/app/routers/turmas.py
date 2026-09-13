from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, delete, select

from app.core.codes import gerar_codigo
from app.db import get_session
from app.deps import get_current_aluno, get_current_professor
from app.schemas import TurmaCreate, TurmaEntrarRequest, TurmaRead
from app.models import (
    Alternativa,
    Aluno,
    Aula,
    Grupo,
    GrupoMembro,
    Matricula,
    Participacao,
    Partida,
    PartidaPulo,
    Pergunta,
    Professor,
    Quiz,
    Resposta,
    Turma,
)

router = APIRouter(prefix="/turmas", tags=["turmas"])


def _codigo_turma_disponivel(session: Session, codigo: str) -> bool:
    return session.exec(select(Turma).where(Turma.codigo_turma == codigo)).first() is None


@router.post("", response_model=TurmaRead, status_code=status.HTTP_201_CREATED)
def criar_turma(
    dados: TurmaCreate,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> Turma:
    codigo = gerar_codigo()
    while not _codigo_turma_disponivel(session, codigo):
        codigo = gerar_codigo()

    turma = Turma(nome=dados.nome, professor_id=professor.id, codigo_turma=codigo)
    session.add(turma)
    session.commit()
    session.refresh(turma)
    return turma


@router.post("/entrar", response_model=TurmaRead)
def entrar_na_turma(
    dados: TurmaEntrarRequest,
    aluno: Aluno = Depends(get_current_aluno),
    session: Session = Depends(get_session),
) -> Turma:
    codigo = dados.codigo_turma.strip().upper()
    turma = session.exec(select(Turma).where(Turma.codigo_turma == codigo)).first()
    if turma is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Código de turma inválido")

    ja_matriculado = session.exec(
        select(Matricula).where(Matricula.turma_id == turma.id, Matricula.aluno_id == aluno.id)
    ).first()
    if ja_matriculado is None:
        session.add(Matricula(turma_id=turma.id, aluno_id=aluno.id))
        session.commit()

    return turma


@router.get("/minhas", response_model=list[TurmaRead])
def minhas_turmas_professor(
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> list[Turma]:
    return list(session.exec(select(Turma).where(Turma.professor_id == professor.id)))


@router.get("/matriculadas", response_model=list[TurmaRead])
def turmas_matriculadas(
    aluno: Aluno = Depends(get_current_aluno),
    session: Session = Depends(get_session),
) -> list[Turma]:
    return list(
        session.exec(
            select(Turma).join(Matricula, Matricula.turma_id == Turma.id).where(Matricula.aluno_id == aluno.id)
        )
    )


@router.post("/{turma_id}/sair", status_code=status.HTTP_200_OK)
def sair_da_turma(
    turma_id: int,
    aluno: Aluno = Depends(get_current_aluno),
    session: Session = Depends(get_session),
) -> dict:
    matricula = session.exec(
        select(Matricula).where(Matricula.turma_id == turma_id, Matricula.aluno_id == aluno.id)
    ).first()
    if not matricula:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Você não está matriculado nesta turma")

    session.delete(matricula)
    session.commit()
    return {"message": "Você saiu da turma com sucesso"}


@router.delete("/{turma_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_turma(
    turma_id: int,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> None:
    turma = session.get(Turma, turma_id)
    if not turma or turma.professor_id != professor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Turma não encontrada")

    # 1. Identificar todas as aulas e quizzes vinculados à turma
    aula_ids = [a for a in session.exec(select(Aula.id).where(Aula.turma_id == turma_id)).all()]
    quiz_ids = list(
        set(
            [q for q in session.exec(select(Quiz.id).where(Quiz.turma_id == turma_id)).all()]
            + ([q for q in session.exec(select(Quiz.id).where(Quiz.aula_id.in_(aula_ids))).all()] if aula_ids else [])
        )
    )

    # 2. Identificar partidas, perguntas e grupos vinculados
    partida_ids = list(
        set(
            ([p for p in session.exec(select(Partida.id).where(Partida.aula_id.in_(aula_ids))).all()] if aula_ids else [])
            + ([p for p in session.exec(select(Partida.id).where(Partida.quiz_id.in_(quiz_ids))).all()] if quiz_ids else [])
        )
    )
    pergunta_ids = (
        [p for p in session.exec(select(Pergunta.id).where(Pergunta.quiz_id.in_(quiz_ids))).all()]
        if quiz_ids
        else []
    )
    grupo_ids = list(
        set(
            ([g for g in session.exec(select(Grupo.id).where(Grupo.partida_id.in_(partida_ids))).all()] if partida_ids else [])
            + ([g for g in session.exec(select(Grupo.id).where(Grupo.quiz_id.in_(quiz_ids))).all()] if quiz_ids else [])
        )
    )

    # 3. Deletar em ordem inversa de dependências (folhas para a raiz)
    if partida_ids:
        session.exec(delete(Resposta).where(Resposta.partida_id.in_(partida_ids)))
        session.exec(delete(PartidaPulo).where(PartidaPulo.partida_id.in_(partida_ids)))
    if pergunta_ids:
        session.exec(delete(Resposta).where(Resposta.pergunta_id.in_(pergunta_ids)))
    if grupo_ids:
        session.exec(delete(GrupoMembro).where(GrupoMembro.grupo_id.in_(grupo_ids)))
        session.exec(delete(Grupo).where(Grupo.id.in_(grupo_ids)))
    if partida_ids:
        session.exec(delete(Partida).where(Partida.id.in_(partida_ids)))
    if aula_ids:
        session.exec(delete(Participacao).where(Participacao.aula_id.in_(aula_ids)))
    if pergunta_ids:
        session.exec(delete(Alternativa).where(Alternativa.pergunta_id.in_(pergunta_ids)))
        session.exec(delete(Pergunta).where(Pergunta.id.in_(pergunta_ids)))
    if quiz_ids:
        session.exec(delete(Quiz).where(Quiz.id.in_(quiz_ids)))
    if aula_ids:
        session.exec(delete(Aula).where(Aula.id.in_(aula_ids)))

    session.exec(delete(Matricula).where(Matricula.turma_id == turma_id))
    session.exec(delete(Turma).where(Turma.id == turma_id))
    session.commit()

