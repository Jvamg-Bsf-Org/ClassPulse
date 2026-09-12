import secrets

# sem caracteres ambíguos (0/O, 1/I/L) pra facilitar leitura na hora de digitar/mostrar em QR
_ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def gerar_codigo(tamanho: int = 6) -> str:
    return "".join(secrets.choice(_ALFABETO) for _ in range(tamanho))
