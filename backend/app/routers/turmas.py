from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

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

    # 1. Remover todas as matrículas (exclusão automática para os alunos)
    matriculas = session.exec(select(Matricula).where(Matricula.turma_id == turma_id)).all()
    for m in matriculas:
        session.delete(m)

    # 2. Remover todas as aulas e suas dependências
    aulas = session.exec(select(Aula).where(Aula.turma_id == turma_id)).all()
    for aula in aulas:
        partidas = session.exec(select(Partida).where(Partida.aula_id == aula.id)).all()
        for p in partidas:
            # Respostas, pulos, grupos
            respostas = session.exec(select(Resposta).where(Resposta.partida_id == p.id)).all()
            for r in respostas:
                session.delete(r)

            pulos = session.exec(select(PartidaPulo).where(PartidaPulo.partida_id == p.id)).all()
            for pulo in pulos:
                session.delete(pulo)

            grupos = session.exec(select(Grupo).where(Grupo.partida_id == p.id)).all()
            for g in grupos:
                membros = session.exec(select(GrupoMembro).where(GrupoMembro.grupo_id == g.id)).all()
                for membro in membros:
                    session.delete(membro)
                session.delete(g)

            session.delete(p)

        participacoes = session.exec(select(Participacao).where(Participacao.aula_id == aula.id)).all()
        for part in participacoes:
            session.delete(part)

        session.delete(aula)

    # 3. Remover quizzes associados à turma
    quizzes = session.exec(select(Quiz).where(Quiz.turma_id == turma_id)).all()
    for q in quizzes:
        perguntas = session.exec(select(Pergunta).where(Pergunta.quiz_id == q.id)).all()
        for perg in perguntas:
            alts = session.exec(select(Alternativa).where(Alternativa.pergunta_id == perg.id)).all()
            for alt in alts:
                session.delete(alt)
            session.delete(perg)
        session.delete(q)

    # 4. Remover a própria turma
    session.delete(turma)
    session.commit()

