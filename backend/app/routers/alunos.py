from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlmodel import Session, select

from app.auth import emitir_tokens
from app.core.rate_limit import limiter
from app.core.security import hash_password, verify_password
from app.db import get_session
from app.models import Aluno
from app.schemas import AlunoCreate, LoginRequest, Token

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
