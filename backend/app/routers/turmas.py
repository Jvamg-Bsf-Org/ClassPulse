from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.codes import gerar_codigo
from app.db import get_session
from app.deps import get_current_aluno, get_current_professor
from app.models import Aluno, Matricula, Professor, Turma
from app.schemas import TurmaCreate, TurmaEntrarRequest, TurmaRead

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
