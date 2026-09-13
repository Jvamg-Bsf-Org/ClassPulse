from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlmodel import Session, select

from app.auth import emitir_tokens
from app.core.rate_limit import limiter
from app.core.security import hash_password, verify_password
from app.db import get_session
from app.deps import get_current_aluno
from app.models import Aluno, Aula, Matricula, Participacao, Turma
from app.schemas import (
    AlunoCreate,
    AulaAlunoDetalhe,
    HistoricoAulaItem,
    LoginRequest,
    MetricasAlunoResponse,
    Token,
    TurmaAlunoDetalhesResponse,
    TurmaRead,
)


router = APIRouter(prefix="/alunos", tags=["alunos"])


@router.post("/cadastro", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def cadastrar(
    request: Request, dados: AlunoCreate, response: Response, session: Session = Depends(get_session)
) -> Token:
    existente = session.exec(select(Aluno).where(Aluno.email == dados.email)).first()
    if existente is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe um aluno com esse email")

    aluno = Aluno(nome=dados.nome, email=dados.email, senha_hash=hash_password(dados.senha))
    session.add(aluno)
    session.commit()
    session.refresh(aluno)

    return emitir_tokens(response, subject=aluno.id, tipo="aluno")


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
def login(
    request: Request, dados: LoginRequest, response: Response, session: Session = Depends(get_session)
) -> Token:
    aluno = session.exec(select(Aluno).where(Aluno.email == dados.email)).first()
    if aluno is None or not verify_password(dados.senha, aluno.senha_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email ou senha inválidos")

    return emitir_tokens(response, subject=aluno.id, tipo="aluno")


@router.get("/metricas", response_model=MetricasAlunoResponse)
def obter_metricas_aluno(
    aluno: Aluno = Depends(get_current_aluno),
    session: Session = Depends(get_session),
) -> MetricasAlunoResponse:
    total_turmas = len(
        session.exec(select(Matricula).where(Matricula.aluno_id == aluno.id)).all()
    )

    participacoes = session.exec(
        select(Participacao).where(Participacao.aluno_id == aluno.id)
    ).all()

    total_aulas = len(participacoes)
    total_foco = sum(p.score_foco_segundos for p in participacoes)
    media_foco = (total_foco / total_aulas) if total_aulas > 0 else 0.0
    media_atividade = (
        sum(p.score_aprendizagem for p in participacoes) / total_aulas
    ) if total_aulas > 0 else 0.0

    return MetricasAlunoResponse(
        media_foco_segundos=round(media_foco, 1),
        media_atividade=round(media_atividade, 1),
        total_foco_segundos=total_foco,
        total_turmas=total_turmas,
        total_aulas_participadas=total_aulas,
    )


@router.get("/turmas/{turma_id}/detalhes", response_model=TurmaAlunoDetalhesResponse)
def obter_detalhes_turma_aluno(
    turma_id: int,
    aluno: Aluno = Depends(get_current_aluno),
    session: Session = Depends(get_session),
) -> TurmaAlunoDetalhesResponse:
    turma = session.get(Turma, turma_id)
    if turma is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Turma não encontrada")

    matricula = session.exec(
        select(Matricula).where(Matricula.turma_id == turma_id, Matricula.aluno_id == aluno.id)
    ).first()
    if matricula is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Você não está matriculado nesta turma")

    aulas = list(
        session.exec(
            select(Aula).where(Aula.turma_id == turma_id).order_by(Aula.created_at.desc())
        )
    )

    # Obter participações do aluno nestas aulas
    aula_ids = [a.id for a in aulas if a.id is not None]
    participacoes = (
        session.exec(
            select(Participacao).where(
                Participacao.aluno_id == aluno.id,
                Participacao.aula_id.in_(aula_ids),
            )
        ).all()
        if aula_ids
        else []
    )
    part_map = {p.aula_id: p for p in participacoes}

    aulas_detalhe: list[AulaAlunoDetalhe] = []
    foco_turma_total = 0
    ativ_turma_total = 0
    participadas_count = 0

    for a in aulas:
        part = part_map.get(a.id)
        if part:
            participou = True
            foco = part.score_foco_segundos
            ativ = part.score_aprendizagem
            foco_turma_total += foco
            ativ_turma_total += ativ
            participadas_count += 1
        else:
            participou = False
            foco = 0
            ativ = 0

        aulas_detalhe.append(
            AulaAlunoDetalhe(
                id=a.id,
                turma_id=a.turma_id,
                titulo=a.titulo,
                codigo_aula=a.codigo_aula,
                status=a.status,
                modo_atual=a.modo_atual,
                created_at=a.created_at,
                participou=participou,
                score_foco_segundos=foco,
                score_aprendizagem=ativ,
            )
        )

    media_foco = (foco_turma_total / participadas_count) if participadas_count > 0 else 0.0
    media_ativ = (ativ_turma_total / participadas_count) if participadas_count > 0 else 0.0

    return TurmaAlunoDetalhesResponse(
        turma=TurmaRead(
            id=turma.id,
            nome=turma.nome,
            codigo_turma=turma.codigo_turma,
            professor_id=turma.professor_id,
            created_at=turma.created_at,
        ),
        media_foco_segundos=round(media_foco, 1),
        media_atividade=round(media_ativ, 1),
        total_aulas=len(aulas),
        aulas_participadas=participadas_count,
        aulas=aulas_detalhe,
    )


@router.get("/historico", response_model=list[HistoricoAulaItem])
def obter_historico_aluno(
    aluno: Aluno = Depends(get_current_aluno),
    session: Session = Depends(get_session),
) -> list[HistoricoAulaItem]:
    participacoes = session.exec(
        select(Participacao).where(Participacao.aluno_id == aluno.id)
    ).all()

    if not participacoes:
        return []

    resultado: list[HistoricoAulaItem] = []
    for part in participacoes:
        aula = session.get(Aula, part.aula_id)
        if not aula:
            continue
        turma = session.get(Turma, aula.turma_id)
        turma_nome = turma.nome if turma else "Turma"

        resultado.append(
            HistoricoAulaItem(
                aula_id=aula.id,
                turma_id=aula.turma_id,
                turma_nome=turma_nome,
                aula_titulo=aula.titulo,
                codigo_aula=aula.codigo_aula,
                status=aula.status,
                created_at=aula.created_at,
                score_foco_segundos=part.score_foco_segundos,
                score_aprendizagem=part.score_aprendizagem,
            )
        )

    resultado.sort(key=lambda x: x.created_at, reverse=True)
    return resultado


