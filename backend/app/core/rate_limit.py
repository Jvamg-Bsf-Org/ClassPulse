from fastapi import Request
from slowapi import Limiter


def get_client_ip(request: Request) -> str:
    """IP real do cliente sem nginx/proxy próprio na frente.

    Render/Railway ficam como único hop entre o cliente e a API, e
    esse hop confiável APENDA o IP real no fim do X-Forwarded-For
    (nunca no começo — o começo pode ter sido forjado pelo próprio
    cliente). Por isso pegamos sempre o ÚLTIMO valor da lista, nunca
    o primeiro.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()

    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=get_client_ip, default_limits=["60/minute"])
