from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.deps import get_current_professor
from app.models import Alternativa, Pergunta, Professor, Quiz, Turma
from app.schemas import (
    AlternativaCreate,
    PerguntaCreate,
    QuizCreate,
    QuizDetailRead,
    QuizRead,
)

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


@router.post("", response_model=QuizDetailRead, status_code=status.HTTP_201_CREATED)
def criar_quiz(
    dados: QuizCreate,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> QuizDetailRead:
    quiz = Quiz(
        professor_id=professor.id,
        turma_id=dados.turma_id,
        titulo=dados.titulo,
        descricao=dados.descricao,
        modo_execucao=dados.modo_execucao,
        competitivo=dados.competitivo,
        obrigatorio=dados.obrigatorio,
        meta_coletiva_percentual=dados.meta_coletiva_percentual,
    )
    session.add(quiz)
    session.commit()
    session.refresh(quiz)

    for i, p_data in enumerate(dados.perguntas):
        pergunta = Pergunta(
            quiz_id=quiz.id,
            enunciado=p_data.enunciado,
            tipo=p_data.tipo,
            ordem=p_data.ordem if p_data.ordem is not None else i,
            pontos=p_data.pontos,
            explicacao=p_data.explicacao,
        )
        session.add(pergunta)
        session.commit()
        session.refresh(pergunta)

        for alt_data in p_data.alternativas:
            alt = Alternativa(
                pergunta_id=pergunta.id,
                texto=alt_data.texto,
                correta=alt_data.correta,
            )
            session.add(alt)
        session.commit()

    return obter_detalhes_quiz(quiz.id, professor, session)


@router.get("/meus", response_model=list[QuizRead])
def listar_meus_quizzes(
    turma_id: int | None = None,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> list[QuizRead]:
    query = select(Quiz).where(Quiz.professor_id == professor.id)
    if turma_id is not None:
        query = query.where(Quiz.turma_id == turma_id)
    quizzes = session.exec(query).all()
    resultado = []
    for q in quizzes:
        perguntas = session.exec(select(Pergunta).where(Pergunta.quiz_id == q.id)).all()
        resultado.append(
            QuizRead(
                id=q.id,
                professor_id=q.professor_id,
                turma_id=q.turma_id,
                titulo=q.titulo,
                descricao=q.descricao,
                modo_execucao=q.modo_execucao,
                competitivo=q.competitivo,
                obrigatorio=q.obrigatorio,
                meta_coletiva_percentual=q.meta_coletiva_percentual,
                created_at=q.created_at,
                total_perguntas=len(perguntas),
            )
        )
    return resultado


@router.get("/turma/{turma_id}", response_model=list[QuizRead])
def listar_quizzes_da_turma(
    turma_id: int,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> list[QuizRead]:
    turma = session.get(Turma, turma_id)
    if not turma or turma.professor_id != professor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Turma não encontrada")

    quizzes = session.exec(
        select(Quiz).where(Quiz.turma_id == turma_id, Quiz.professor_id == professor.id)
    ).all()
    resultado = []
    for q in quizzes:
        perguntas = session.exec(select(Pergunta).where(Pergunta.quiz_id == q.id)).all()
        resultado.append(
            QuizRead(
                id=q.id,
                professor_id=q.professor_id,
                turma_id=q.turma_id,
                titulo=q.titulo,
                descricao=q.descricao,
                modo_execucao=q.modo_execucao,
                competitivo=q.competitivo,
                obrigatorio=q.obrigatorio,
                meta_coletiva_percentual=q.meta_coletiva_percentual,
                created_at=q.created_at,
                total_perguntas=len(perguntas),
            )
        )
    return resultado


@router.get("/{quiz_id}", response_model=QuizDetailRead)
def obter_detalhes_quiz(
    quiz_id: int,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> QuizDetailRead:
    quiz = session.get(Quiz, quiz_id)
    if not quiz or quiz.professor_id != professor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz não encontrado")

    perguntas = session.exec(
        select(Pergunta).where(Pergunta.quiz_id == quiz.id).order_by(Pergunta.ordem)
    ).all()

    perguntas_completas = []
    for p in perguntas:
        alts = session.exec(select(Alternativa).where(Alternativa.pergunta_id == p.id)).all()
        p_dict = p.model_dump()
        p_dict["alternativas"] = [a.model_dump() for a in alts]
        perguntas_completas.append(p_dict)

    q_dict = quiz.model_dump()
    q_dict["total_perguntas"] = len(perguntas)
    q_dict["perguntas"] = perguntas_completas
    return QuizDetailRead(**q_dict)


@router.delete("/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_quiz(
    quiz_id: int,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> None:
    quiz = session.get(Quiz, quiz_id)
    if not quiz or quiz.professor_id != professor.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz não encontrado")

    perguntas = session.exec(select(Pergunta).where(Pergunta.quiz_id == quiz.id)).all()
    for p in perguntas:
        alts = session.exec(select(Alternativa).where(Alternativa.pergunta_id == p.id)).all()
        for a in alts:
            session.delete(a)
        session.delete(p)

    session.delete(quiz)
    session.commit()
