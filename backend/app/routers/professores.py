from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlmodel import Session, select

from app.auth import emitir_tokens
from app.core.rate_limit import limiter
from app.core.security import hash_password, verify_password
from app.db import get_session
from app.deps import get_current_professor
from app.models import Aluno, Aula, Matricula, Participacao, Professor, Turma
from app.schemas import (
    AlunoDesempenhoTurma,
    AulaResumoProfessor,
    EstatisticasTurmaProfessorResponse,
    LoginRequest,
    MetricasProfessorResponse,
    ProfessorCreate,
    Token,
    TurmaRead,
)

router = APIRouter(prefix="/professores", tags=["professores"])


@router.post("/cadastro", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def cadastrar(
    request: Request, dados: ProfessorCreate, response: Response, session: Session = Depends(get_session)
) -> Token:
    existente = session.exec(select(Professor).where(Professor.email == dados.email)).first()
    if existente is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe um professor com esse email")

    professor = Professor(nome=dados.nome, email=dados.email, senha_hash=hash_password(dados.senha))
    session.add(professor)
    session.commit()
    session.refresh(professor)

    return emitir_tokens(response, subject=professor.id, tipo="professor")


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
def login(
    request: Request, dados: LoginRequest, response: Response, session: Session = Depends(get_session)
) -> Token:
    professor = session.exec(select(Professor).where(Professor.email == dados.email)).first()
    if professor is None or not verify_password(dados.senha, professor.senha_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email ou senha inválidos")

    return emitir_tokens(response, subject=professor.id, tipo="professor")


@router.get("/metricas", response_model=MetricasProfessorResponse)
def obter_metricas_professor(
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> MetricasProfessorResponse:
    turmas = session.exec(select(Turma).where(Turma.professor_id == professor.id)).all()
    turma_ids = [t.id for t in turmas if t.id is not None]

    if not turma_ids:
        return MetricasProfessorResponse()

    aulas = session.exec(
        select(Aula).where(Aula.turma_id.in_(turma_ids)).order_by(Aula.created_at.desc())
    ).all()
    aula_ids = [a.id for a in aulas if a.id is not None]

    matriculas = session.exec(
        select(Matricula).where(Matricula.turma_id.in_(turma_ids))
    ).all()
    total_alunos_unicos = len(set(m.aluno_id for m in matriculas))

    participacoes = (
        session.exec(select(Participacao).where(Participacao.aula_id.in_(aula_ids))).all()
        if aula_ids
        else []
    )

    total_parts = len(participacoes)
    media_foco = (
        sum(p.score_foco_segundos for p in participacoes) / total_parts if total_parts > 0 else 0.0
    )
    media_ativ = (
        sum(p.score_aprendizagem for p in participacoes) / total_parts if total_parts > 0 else 0.0
    )

    turma_map = {t.id: t.nome for t in turmas}

    aulas_recentes: list[AulaResumoProfessor] = []
    for aula in aulas[:8]:
        parts_aula = [p for p in participacoes if p.aula_id == aula.id]
        n_parts = len(parts_aula)
        mf_aula = sum(p.score_foco_segundos for p in parts_aula) / n_parts if n_parts > 0 else 0.0
        ma_aula = sum(p.score_aprendizagem for p in parts_aula) / n_parts if n_parts > 0 else 0.0

        aulas_recentes.append(
            AulaResumoProfessor(
                id=aula.id,
                turma_id=aula.turma_id,
                turma_nome=turma_map.get(aula.turma_id, "Turma"),
                titulo=aula.titulo,
                codigo_aula=aula.codigo_aula,
                status=aula.status,
                modo_atual=aula.modo_atual,
                created_at=aula.created_at,
                total_alunos_participantes=n_parts,
                media_foco_segundos=round(mf_aula, 1),
                media_atividade=round(ma_aula, 1),
            )
        )

    return MetricasProfessorResponse(
        total_turmas=len(turmas),
        total_aulas=len(aulas),
        total_alunos=total_alunos_unicos,
        media_foco_geral_segundos=round(media_foco, 1),
        media_atividades_geral=round(media_ativ, 1),
        aulas_recentes=aulas_recentes,
    )


@router.get("/turmas/{turma_id}/estatisticas", response_model=EstatisticasTurmaProfessorResponse)
def obter_estatisticas_turma_professor(
    turma_id: int,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> EstatisticasTurmaProfessorResponse:
    turma = session.get(Turma, turma_id)
    if not turma or turma.professor_id != professor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Turma não encontrada")

    aulas = session.exec(
        select(Aula).where(Aula.turma_id == turma_id).order_by(Aula.created_at.desc())
    ).all()
    aula_ids = [a.id for a in aulas if a.id is not None]

    matriculas = session.exec(select(Matricula).where(Matricula.turma_id == turma_id)).all()
    aluno_ids = [m.aluno_id for m in matriculas]

    participacoes = (
        session.exec(select(Participacao).where(Participacao.aula_id.in_(aula_ids))).all()
        if aula_ids
        else []
    )

    total_parts = len(participacoes)
    media_foco_turma = (
        sum(p.score_foco_segundos for p in participacoes) / total_parts if total_parts > 0 else 0.0
    )
    media_ativ_turma = (
        sum(p.score_aprendizagem for p in participacoes) / total_parts if total_parts > 0 else 0.0
    )

    alunos_desempenho: list[AlunoDesempenhoTurma] = []
    for mat in matriculas:
        aluno = session.get(Aluno, mat.aluno_id)
        if not aluno:
            continue
        parts_aluno = [p for p in participacoes if p.aluno_id == aluno.id]
        count = len(parts_aluno)
        mf_aluno = sum(p.score_foco_segundos for p in parts_aluno) / count if count > 0 else 0.0
        ma_aluno = sum(p.score_aprendizagem for p in parts_aluno) / count if count > 0 else 0.0

        alunos_desempenho.append(
            AlunoDesempenhoTurma(
                id=aluno.id,
                nome=aluno.nome,
                email=aluno.email,
                matriculado_em=mat.matriculado_em,
                total_aulas_participadas=count,
                media_foco_segundos=round(mf_aluno, 1),
                media_atividade=round(ma_aluno, 1),
            )
        )

    # Ordenar por nome
    alunos_desempenho.sort(key=lambda x: x.nome)

    return EstatisticasTurmaProfessorResponse(
        turma=TurmaRead(
            id=turma.id,
            nome=turma.nome,
            codigo_turma=turma.codigo_turma,
            professor_id=turma.professor_id,
            created_at=turma.created_at,
        ),
        total_alunos=len(matriculas),
        total_aulas=len(aulas),
        media_foco_segundos=round(media_foco_turma, 1),
        media_atividade=round(media_ativ_turma, 1),
        alunos=alunos_desempenho,
    )
