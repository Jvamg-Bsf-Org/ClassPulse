from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlmodel import Session, select

from app.auth import emitir_tokens
from app.core.rate_limit import limiter
from app.core.security import hash_password, verify_password
from app.db import get_session
from app.models import Professor
from app.schemas import LoginRequest, ProfessorCreate, Token

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
