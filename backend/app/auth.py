from fastapi import Response

from app.core.cookies import set_refresh_cookie
from app.core.security import TipoUsuario, create_access_token, create_refresh_token
from app.schemas import Token


def emitir_tokens(response: Response, *, subject: int, tipo: TipoUsuario) -> Token:
    """Cria access token (retornado no corpo) e refresh token (cookie httponly)."""
    access = create_access_token(subject=subject, tipo=tipo)
    refresh = create_refresh_token(subject=subject, tipo=tipo)
    set_refresh_cookie(response, refresh)
    return Token(access_token=access, tipo=tipo)
