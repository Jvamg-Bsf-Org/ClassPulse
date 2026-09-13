from datetime import datetime, timedelta, timezone
from typing import Literal

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

TipoUsuario = Literal["professor", "aluno"]

_BCRYPT_MAX_BYTES = 72
# Custo 12 (o default do gensalt()) mede ~400ms por hash/verificação -- em toda
# tela de login e cadastro. Custo 10 ainda é o mínimo recomendado pela OWASP e
# cai pra ~100ms. O custo fica embutido no hash salvo, então isso não invalida
# nem precisa de migração pra contas já cadastradas com custo 12.
_BCRYPT_ROUNDS = 10


def hash_password(senha: str) -> str:
    senha_bytes = senha.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(senha_bytes, bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(senha: str, senha_hash: str) -> bool:
    senha_bytes = senha.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    return bcrypt.checkpw(senha_bytes, senha_hash.encode("utf-8"))


TipoToken = Literal["access", "refresh"]


def _criar_token(*, subject: int, tipo: TipoUsuario, tipo_token: TipoToken, expira_em: timedelta) -> str:
    expira = datetime.now(timezone.utc) + expira_em
    payload = {"sub": str(subject), "tipo": tipo, "token_tipo": tipo_token, "exp": expira}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(*, subject: int, tipo: TipoUsuario) -> str:
    return _criar_token(
        subject=subject,
        tipo=tipo,
        tipo_token="access",
        expira_em=timedelta(minutes=settings.access_token_expire_minutes),
    )


def create_refresh_token(*, subject: int, tipo: TipoUsuario) -> str:
    return _criar_token(
        subject=subject,
        tipo=tipo,
        tipo_token="refresh",
        expira_em=timedelta(days=settings.refresh_token_expire_days),
    )


class TokenPayload:
    def __init__(self, usuario_id: int, tipo: TipoUsuario):
        self.usuario_id = usuario_id
        self.tipo = tipo


def _decode_token(token: str, *, esperado: TipoToken) -> TokenPayload | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None

    sub = payload.get("sub")
    tipo = payload.get("tipo")
    token_tipo = payload.get("token_tipo")
    if sub is None or tipo not in ("professor", "aluno") or token_tipo != esperado:
        return None

    return TokenPayload(usuario_id=int(sub), tipo=tipo)


def decode_access_token(token: str) -> TokenPayload | None:
    return _decode_token(token, esperado="access")


def decode_refresh_token(token: str) -> TokenPayload | None:
    return _decode_token(token, esperado="refresh")
