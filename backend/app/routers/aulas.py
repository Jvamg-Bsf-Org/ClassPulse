from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.codes import gerar_codigo
from app.core.ws_manager import manager
from app.db import get_session
from app.deps import get_current_aluno, get_current_professor, get_current_user
from app.models import Aluno, Aula, Matricula, Participacao, Professor, StatusAula, Turma
from app.schemas import AulaCreate, AulaEntrarRequest, AulaModoRequest, AulaRead, FocoScoreRequest

router = APIRouter(prefix="/aulas", tags=["aulas"])


def _codigo_aula_disponivel(session: Session, codigo: str) -> bool:
    return session.exec(select(Aula).where(Aula.codigo_aula == codigo)).first() is None


def _turma_do_professor(session: Session, turma_id: int, professor: Professor) -> Turma:
    turma = session.get(Turma, turma_id)
    if turma is None or turma.professor_id != professor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Turma não encontrada ou não é sua")
    return turma


def _aula_do_professor(session: Session, aula_id: int, professor: Professor) -> Aula:
    aula = session.get(Aula, aula_id)
    if aula is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aula não encontrada")
    _turma_do_professor(session, aula.turma_id, professor)
    return aula


@router.get("/turma/{turma_id}", response_model=list[AulaRead])
def listar_aulas_da_turma(
    turma_id: int,
    user_info: tuple[str, Aluno | Professor] = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[Aula]:
    tipo, usuario = user_info
    if tipo == "professor":
        _turma_do_professor(session, turma_id, usuario)
    else:
        matricula = session.exec(
            select(Matricula).where(Matricula.turma_id == turma_id, Matricula.aluno_id == usuario.id)
        ).first()
        if matricula is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Você não está matriculado nesta turma")

    return list(
        session.exec(select(Aula).where(Aula.turma_id == turma_id).order_by(Aula.created_at.desc()))
    )



@router.post("", response_model=AulaRead, status_code=status.HTTP_201_CREATED)
def criar_aula(
    dados: AulaCreate,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> Aula:
    _turma_do_professor(session, dados.turma_id, professor)

    codigo = gerar_codigo()
    while not _codigo_aula_disponivel(session, codigo):
        codigo = gerar_codigo()

    aula = Aula(
        turma_id=dados.turma_id,
        titulo=dados.titulo,
        codigo_aula=codigo,
        status=StatusAula.em_andamento,
        iniciada_em=datetime.utcnow(),
    )
    session.add(aula)
    session.commit()
    session.refresh(aula)
    return aula


@router.post("/entrar", response_model=AulaRead)
def entrar_na_aula(
    dados: AulaEntrarRequest,
    aluno: Aluno = Depends(get_current_aluno),
    session: Session = Depends(get_session),
) -> Aula:
    codigo = dados.codigo_aula.strip().upper()
    aula = session.exec(select(Aula).where(Aula.codigo_aula == codigo)).first()
    if aula is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Código de aula inválido")

    matriculado = session.exec(
        select(Matricula).where(Matricula.turma_id == aula.turma_id, Matricula.aluno_id == aluno.id)
    ).first()
    if matriculado is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Você não está matriculado na turma desta aula")

    participacao = session.exec(
        select(Participacao).where(Participacao.aula_id == aula.id, Participacao.aluno_id == aluno.id)
    ).first()
    if participacao is None:
        session.add(Participacao(aula_id=aula.id, aluno_id=aluno.id))
        session.commit()

    return aula


@router.get("/{aula_id}", response_model=AulaRead)
def obter_aula(
    aula_id: int,
    user_info: tuple[str, Aluno | Professor] = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Aula:
    aula = session.get(Aula, aula_id)
    if aula is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aula não encontrada")

    tipo, usuario = user_info
    if tipo == "professor":
        _turma_do_professor(session, aula.turma_id, usuario)
    else:
        participacao = session.exec(
            select(Participacao).where(Participacao.aula_id == aula.id, Participacao.aluno_id == usuario.id)
        ).first()
        if participacao is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Você não participa desta aula")

    return aula


@router.post("/{aula_id}/modo", response_model=AulaRead)
async def mudar_modo(
    aula_id: int,
    dados: AulaModoRequest,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> Aula:
    aula = _aula_do_professor(session, aula_id, professor)

    aula.modo_atual = dados.modo
    if aula.status == StatusAula.nao_iniciada:
        aula.status = StatusAula.em_andamento
        aula.iniciada_em = datetime.utcnow()
    session.add(aula)
    session.commit()
    session.refresh(aula)

    await manager.broadcast(aula.id, {"evento": "modo_mudou", "modo": aula.modo_atual.value})

    return aula


@router.post("/{aula_id}/encerrar", response_model=AulaRead)
async def encerrar_aula(
    aula_id: int,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> Aula:
    aula = _aula_do_professor(session, aula_id, professor)

    aula.status = StatusAula.encerrada
    aula.encerrada_em = datetime.utcnow()
    session.add(aula)
    session.commit()
    session.refresh(aula)

    await manager.broadcast(aula.id, {"evento": "aula_encerrada"})

    return aula


@router.post("/{aula_id}/foco", status_code=status.HTTP_204_NO_CONTENT)
def reportar_foco(
    aula_id: int,
    dados: FocoScoreRequest,
    aluno: Aluno = Depends(get_current_aluno),
    session: Session = Depends(get_session),
) -> None:
    participacao = session.exec(
        select(Participacao).where(Participacao.aula_id == aula_id, Participacao.aluno_id == aluno.id)
    ).first()
    if participacao is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Você não participa desta aula")

    # O frontend manda o total acumulado da sessão de foco atual (não um delta),
    # então é sempre um "set", nunca soma — reenvio/retry não duplica.
    participacao.score_foco_segundos = dados.foco_segundos
    session.add(participacao)
    session.commit()
