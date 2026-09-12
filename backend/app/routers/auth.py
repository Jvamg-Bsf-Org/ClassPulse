from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlmodel import Session

from app.auth import emitir_tokens
from app.core.cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie
from app.core.security import decode_refresh_token
from app.db import get_session
from app.models import Aluno, Professor
from app.schemas import Token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/refresh", response_model=Token)
def refresh(
    response: Response,
    session: Session = Depends(get_session),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> Token:
    if refresh_token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token ausente")

    payload = decode_refresh_token(refresh_token)
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token inválido ou expirado")

    modelo = Professor if payload.tipo == "professor" else Aluno
    usuario = session.get(modelo, payload.usuario_id)
    if usuario is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuário não encontrado")

    return emitir_tokens(response, subject=usuario.id, tipo=payload.tipo)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    clear_refresh_cookie(response)
