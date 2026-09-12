from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.core.security import decode_access_token
from app.db import get_session
from app.models import Aluno, Professor

bearer_scheme = HTTPBearer(auto_error=False)


def _get_token_payload(credentials: HTTPAuthorizationCredentials | None):
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token ausente")

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido ou expirado")

    return payload


def get_current_professor(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> Professor:
    payload = _get_token_payload(credentials)
    if payload.tipo != "professor":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Rota exclusiva para professores")

    professor = session.get(Professor, payload.usuario_id)
    if professor is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Professor não encontrado")

    return professor


def get_current_aluno(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> Aluno:
    payload = _get_token_payload(credentials)
    if payload.tipo != "aluno":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Rota exclusiva para alunos")

    aluno = session.get(Aluno, payload.usuario_id)
    if aluno is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Aluno não encontrado")

    return aluno


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> tuple[str, Aluno | Professor]:
    payload = _get_token_payload(credentials)
    if payload.tipo == "professor":
        professor = session.get(Professor, payload.usuario_id)
        if professor is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Professor não encontrado")
        return ("professor", professor)
    elif payload.tipo == "aluno":
        aluno = session.get(Aluno, payload.usuario_id)
        if aluno is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Aluno não encontrado")
        return ("aluno", aluno)
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tipo de usuário inválido")

