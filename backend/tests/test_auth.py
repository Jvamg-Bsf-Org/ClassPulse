import pytest
from fastapi.testclient import TestClient

from app.core.rate_limit import limiter


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    """Sem isso, rodar vários testes de auth na mesma suíte estoura o limite
    (5/min em cadastro, 10/min em login) e os testes ficam instáveis."""
    limiter.reset()
    yield


def test_professor_cadastro_e_login(client: TestClient):
    r = client.post(
        "/professores/cadastro",
        json={"nome": "Ana", "email": "ana@escola.com", "senha": "123456"},
    )
    assert r.status_code == 201, r.text
    corpo = r.json()
    assert corpo["tipo"] == "professor"
    assert corpo["access_token"]

    r = client.post("/professores/login", json={"email": "ana@escola.com", "senha": "123456"})
    assert r.status_code == 200, r.text
    assert r.json()["tipo"] == "professor"


def test_professor_cadastro_com_email_duplicado_da_409(client: TestClient):
    dados = {"nome": "Ana", "email": "duplicado@escola.com", "senha": "123456"}
    assert client.post("/professores/cadastro", json=dados).status_code == 201
    r = client.post("/professores/cadastro", json=dados)
    assert r.status_code == 409, r.text


def test_professor_login_com_senha_errada_da_401(client: TestClient):
    client.post(
        "/professores/cadastro",
        json={"nome": "Ana", "email": "senha@escola.com", "senha": "123456"},
    )
    r = client.post("/professores/login", json={"email": "senha@escola.com", "senha": "errada"})
    assert r.status_code == 401, r.text


def test_aluno_cadastro_e_login(client: TestClient):
    r = client.post(
        "/alunos/cadastro",
        json={"nome": "Beto", "email": "beto@escola.com", "senha": "abcdef"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["tipo"] == "aluno"

    r = client.post("/alunos/login", json={"email": "beto@escola.com", "senha": "abcdef"})
    assert r.status_code == 200, r.text


def test_login_de_professor_nao_reconhece_email_de_aluno(client: TestClient):
    client.post("/alunos/cadastro", json={"nome": "Beto", "email": "so-aluno@escola.com", "senha": "abcdef"})
    r = client.post("/professores/login", json={"email": "so-aluno@escola.com", "senha": "abcdef"})
    assert r.status_code == 401, r.text


def test_refresh_renova_o_access_token_via_cookie(client: TestClient):
    client.post("/professores/cadastro", json={"nome": "Ana", "email": "refresh@escola.com", "senha": "123456"})
    r = client.post("/professores/login", json={"email": "refresh@escola.com", "senha": "123456"})
    assert "classpulse_refresh" in r.cookies

    r = client.post("/auth/refresh")
    assert r.status_code == 200, r.text
    assert r.json()["tipo"] == "professor"


def test_refresh_sem_cookie_da_401(client: TestClient):
    r = client.post("/auth/refresh")
    assert r.status_code == 401, r.text


def test_logout_invalida_o_refresh(client: TestClient):
    client.post("/professores/cadastro", json={"nome": "Ana", "email": "logout@escola.com", "senha": "123456"})
    client.post("/professores/login", json={"email": "logout@escola.com", "senha": "123456"})

    r = client.post("/auth/logout")
    assert r.status_code == 204, r.text

    r = client.post("/auth/refresh")
    assert r.status_code == 401, r.text


def test_rota_protegida_sem_token_da_401(client: TestClient):
    r = client.get("/turmas/minhas")
    assert r.status_code == 401, r.text


def test_cadastro_de_professor_tem_rate_limit(client: TestClient):
    for i in range(5):
        r = client.post(
            "/professores/cadastro",
            json={"nome": "X", "email": f"limite{i}@escola.com", "senha": "123456"},
        )
        assert r.status_code == 201, r.text

    r = client.post(
        "/professores/cadastro",
        json={"nome": "X", "email": "limite-estourou@escola.com", "senha": "123456"},
    )
    assert r.status_code == 429, r.text
