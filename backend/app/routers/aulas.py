from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, delete, select

from app.core.codes import gerar_codigo
from app.core.ws_manager import manager
from app.db import get_session
from app.deps import get_current_aluno, get_current_professor, get_current_user
from app.models import (
    Alternativa,
    Aluno,
    Aula,
    Grupo,
    GrupoMembro,
    Matricula,
    ModoAula,
    Participacao,
    Partida,
    PartidaPulo,
    Pergunta,
    Professor,
    Quiz,
    Resposta,
    StatusAula,
    Turma,
)
from app.schemas import AulaCreate, AulaEntrarRequest, AulaModoRequest, AulaRead, FocoScoreRequest

router = APIRouter(prefix="/aulas", tags=["aulas"])

# Tempo parado no MESMO modo (não o tempo total da aula) que faz a aula ser
# considerada esquecida/abandonada e ser encerrada sozinha. Os limites são
# generosos o bastante pra nunca pegar uma aula que está realmente em uso --
# Foco é maior porque uma explicação teórica legítima já passa dos 50min
# (ver o pitch deck), Livre normalmente é usado em rajadas mais curtas.
_LIMITE_INATIVIDADE_POR_MODO: dict[ModoAula, timedelta] = {
    ModoAula.livre: timedelta(hours=1),
    ModoAula.foco: timedelta(hours=1, minutes=30),
}


async def _fechar_se_abandonada(session: Session, aula: Aula) -> Aula:
    """Auto-encerra uma aula que ficou parada tempo demais no mesmo modo,
    sem depender de nenhum processo em background: roda de forma preguiçosa
    sempre que alguém (professor ou aluno) toca nessa aula."""
    if aula.status != StatusAula.em_andamento or aula.modo_atualizado_em is None:
        return aula

    limite = _LIMITE_INATIVIDADE_POR_MODO.get(aula.modo_atual)
    if limite is None or datetime.utcnow() - aula.modo_atualizado_em < limite:
        return aula

    aula.status = StatusAula.encerrada
    aula.encerrada_em = datetime.utcnow()
    session.add(aula)
    session.commit()
    session.refresh(aula)

    await manager.broadcast(aula.id, {"evento": "aula_encerrada"})
    return aula


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
async def listar_aulas_da_turma(
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

    aulas = list(
        session.exec(select(Aula).where(Aula.turma_id == turma_id).order_by(Aula.created_at.desc()))
    )
    return [await _fechar_se_abandonada(session, aula) for aula in aulas]



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
async def entrar_na_aula(
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

    aula = await _fechar_se_abandonada(session, aula)

    participacao = session.exec(
        select(Participacao).where(Participacao.aula_id == aula.id, Participacao.aluno_id == aluno.id)
    ).first()
    if participacao is None:
        session.add(Participacao(aula_id=aula.id, aluno_id=aluno.id))
        session.commit()

    return aula


@router.get("/{aula_id}", response_model=AulaRead)
async def obter_aula(
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

    return await _fechar_se_abandonada(session, aula)


@router.post("/{aula_id}/modo", response_model=AulaRead)
async def mudar_modo(
    aula_id: int,
    dados: AulaModoRequest,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> Aula:
    aula = _aula_do_professor(session, aula_id, professor)

    aula.modo_atual = dados.modo
    aula.modo_atualizado_em = datetime.utcnow()
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


@router.delete("/{aula_id}", status_code=status.HTTP_204_NO_CONTENT)
async def excluir_aula(
    aula_id: int,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> None:
    aula = _aula_do_professor(session, aula_id, professor)

    partida_ids = [p for p in session.exec(select(Partida.id).where(Partida.aula_id == aula_id)).all()]
    quiz_ids = [q for q in session.exec(select(Quiz.id).where(Quiz.aula_id == aula_id)).all()]
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
    session.exec(delete(Participacao).where(Participacao.aula_id == aula_id))
    if pergunta_ids:
        session.exec(delete(Alternativa).where(Alternativa.pergunta_id.in_(pergunta_ids)))
        session.exec(delete(Pergunta).where(Pergunta.id.in_(pergunta_ids)))
    if quiz_ids:
        session.exec(delete(Quiz).where(Quiz.id.in_(quiz_ids)))

    session.exec(delete(Aula).where(Aula.id == aula_id))
    session.commit()

    await manager.broadcast(aula_id, {"evento": "aula_encerrada"})

