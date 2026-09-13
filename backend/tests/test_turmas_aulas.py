from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.rate_limit import limiter
from app.models import Aula


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    limiter.reset()
    yield


def _cadastrar_professor(client: TestClient, email: str) -> dict[str, str]:
    r = client.post("/professores/cadastro", json={"nome": "Prof", "email": email, "senha": "123456"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _cadastrar_aluno(client: TestClient, email: str) -> dict[str, str]:
    r = client.post("/alunos/cadastro", json={"nome": "Aluno", "email": email, "senha": "abcdef"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---------------------------------------------------------------------------
# Turmas
# ---------------------------------------------------------------------------


def test_professor_cria_turma_e_recebe_codigo(client: TestClient):
    h = _cadastrar_professor(client, "prof1@escola.com")
    r = client.post("/turmas", json={"nome": "Biologia 9A"}, headers=h)
    assert r.status_code == 201, r.text
    corpo = r.json()
    assert corpo["nome"] == "Biologia 9A"
    assert len(corpo["codigo_turma"]) >= 5


def test_aluno_nao_pode_criar_turma(client: TestClient):
    h = _cadastrar_aluno(client, "aluno1@escola.com")
    r = client.post("/turmas", json={"nome": "Hack"}, headers=h)
    assert r.status_code == 403, r.text


def test_aluno_entra_na_turma_por_codigo(client: TestClient):
    h_prof = _cadastrar_professor(client, "prof2@escola.com")
    h_aluno = _cadastrar_aluno(client, "aluno2@escola.com")
    turma = client.post("/turmas", json={"nome": "Física"}, headers=h_prof).json()

    r = client.post("/turmas/entrar", json={"codigo_turma": turma["codigo_turma"]}, headers=h_aluno)
    assert r.status_code == 200, r.text

    # idempotente: entrar de novo não duplica nem quebra
    r = client.post("/turmas/entrar", json={"codigo_turma": turma["codigo_turma"]}, headers=h_aluno)
    assert r.status_code == 200, r.text

    matriculadas = client.get("/turmas/matriculadas", headers=h_aluno).json()
    assert len(matriculadas) == 1


def test_entrar_com_codigo_de_turma_invalido_da_404(client: TestClient):
    h_aluno = _cadastrar_aluno(client, "aluno3@escola.com")
    r = client.post("/turmas/entrar", json={"codigo_turma": "NAOEXISTE"}, headers=h_aluno)
    assert r.status_code == 404, r.text


def test_minhas_turmas_so_lista_as_do_proprio_professor(client: TestClient):
    h1 = _cadastrar_professor(client, "profA@escola.com")
    h2 = _cadastrar_professor(client, "profB@escola.com")
    client.post("/turmas", json={"nome": "Turma do A"}, headers=h1)
    client.post("/turmas", json={"nome": "Turma do B"}, headers=h2)

    minhas_a = client.get("/turmas/minhas", headers=h1).json()
    assert [t["nome"] for t in minhas_a] == ["Turma do A"]


# ---------------------------------------------------------------------------
# Aulas
# ---------------------------------------------------------------------------


def test_professor_cria_aula_na_propria_turma(client: TestClient):
    h_prof = _cadastrar_professor(client, "prof3@escola.com")
    turma = client.post("/turmas", json={"nome": "Química"}, headers=h_prof).json()

    r = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof)
    assert r.status_code == 201, r.text
    aula = r.json()
    assert aula["modo_atual"] == "livre"
    assert aula["status"] == "em_andamento"
    assert len(aula["codigo_aula"]) >= 5


def test_professor_nao_pode_criar_aula_em_turma_alheia(client: TestClient):
    h1 = _cadastrar_professor(client, "dono@escola.com")
    h2 = _cadastrar_professor(client, "intruso@escola.com")
    turma = client.post("/turmas", json={"nome": "Turma do Dono"}, headers=h1).json()

    r = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula"}, headers=h2)
    assert r.status_code == 403, r.text


def test_aluno_precisa_estar_matriculado_na_turma_pra_entrar_na_aula(client: TestClient):
    h_prof = _cadastrar_professor(client, "prof4@escola.com")
    h_aluno = _cadastrar_aluno(client, "aluno4@escola.com")
    turma = client.post("/turmas", json={"nome": "História"}, headers=h_prof).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof).json()

    r = client.post("/aulas/entrar", json={"codigo_aula": aula["codigo_aula"]}, headers=h_aluno)
    assert r.status_code == 403, r.text

    client.post("/turmas/entrar", json={"codigo_turma": turma["codigo_turma"]}, headers=h_aluno)
    r = client.post("/aulas/entrar", json={"codigo_aula": aula["codigo_aula"]}, headers=h_aluno)
    assert r.status_code == 200, r.text

    # idempotente
    r = client.post("/aulas/entrar", json={"codigo_aula": aula["codigo_aula"]}, headers=h_aluno)
    assert r.status_code == 200, r.text


def test_entrar_com_codigo_de_aula_invalido_da_404(client: TestClient):
    h_aluno = _cadastrar_aluno(client, "aluno5@escola.com")
    r = client.post("/aulas/entrar", json={"codigo_aula": "NAOEXISTE"}, headers=h_aluno)
    assert r.status_code == 404, r.text


def test_obter_aula_acessivel_pro_professor_dono_e_pro_aluno_participante(client: TestClient):
    h_prof = _cadastrar_professor(client, "prof5@escola.com")
    h_aluno = _cadastrar_aluno(client, "aluno6@escola.com")
    turma = client.post("/turmas", json={"nome": "Geografia"}, headers=h_prof).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof).json()
    client.post("/turmas/entrar", json={"codigo_turma": turma["codigo_turma"]}, headers=h_aluno)
    client.post("/aulas/entrar", json={"codigo_aula": aula["codigo_aula"]}, headers=h_aluno)

    assert client.get(f"/aulas/{aula['id']}", headers=h_prof).status_code == 200
    assert client.get(f"/aulas/{aula['id']}", headers=h_aluno).status_code == 200


def test_obter_aula_bloqueada_pra_aluno_que_nao_participa(client: TestClient):
    h_prof = _cadastrar_professor(client, "prof6@escola.com")
    h_aluno = _cadastrar_aluno(client, "aluno7@escola.com")
    turma = client.post("/turmas", json={"nome": "Artes"}, headers=h_prof).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof).json()

    r = client.get(f"/aulas/{aula['id']}", headers=h_aluno)
    assert r.status_code == 403, r.text


def test_professor_muda_modo_e_aula_continua_em_andamento(client: TestClient):
    h_prof = _cadastrar_professor(client, "prof7@escola.com")
    turma = client.post("/turmas", json={"nome": "Educação Física"}, headers=h_prof).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof).json()
    assert aula["status"] == "em_andamento"

    r = client.post(f"/aulas/{aula['id']}/modo", json={"modo": "foco"}, headers=h_prof)
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["modo_atual"] == "foco"
    assert corpo["status"] == "em_andamento"


def test_aluno_nao_pode_mudar_modo_da_aula(client: TestClient):
    h_prof = _cadastrar_professor(client, "prof8@escola.com")
    h_aluno = _cadastrar_aluno(client, "aluno8@escola.com")
    turma = client.post("/turmas", json={"nome": "Inglês"}, headers=h_prof).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof).json()

    r = client.post(f"/aulas/{aula['id']}/modo", json={"modo": "foco"}, headers=h_aluno)
    assert r.status_code == 403, r.text


def test_professor_de_outra_turma_nao_pode_mudar_modo(client: TestClient):
    h_dono = _cadastrar_professor(client, "dono2@escola.com")
    h_outro = _cadastrar_professor(client, "outro2@escola.com")
    turma = client.post("/turmas", json={"nome": "Turma X"}, headers=h_dono).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_dono).json()

    r = client.post(f"/aulas/{aula['id']}/modo", json={"modo": "foco"}, headers=h_outro)
    assert r.status_code == 403, r.text


def test_encerrar_aula(client: TestClient):
    h_prof = _cadastrar_professor(client, "prof9@escola.com")
    turma = client.post("/turmas", json={"nome": "Redação"}, headers=h_prof).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof).json()

    r = client.post(f"/aulas/{aula['id']}/encerrar", headers=h_prof)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "encerrada"


def test_listar_aulas_da_turma_bloqueada_pra_quem_nao_e_dono(client: TestClient):
    h_dono = _cadastrar_professor(client, "dono3@escola.com")
    h_outro = _cadastrar_professor(client, "outro3@escola.com")
    turma = client.post("/turmas", json={"nome": "Turma Y"}, headers=h_dono).json()
    client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_dono)

    assert len(client.get(f"/aulas/turma/{turma['id']}", headers=h_dono).json()) == 1
    assert client.get(f"/aulas/turma/{turma['id']}", headers=h_outro).status_code == 403


def test_aluno_reporta_score_de_foco(client: TestClient):
    h_prof = _cadastrar_professor(client, "prof10@escola.com")
    h_aluno = _cadastrar_aluno(client, "aluno10@escola.com")
    turma = client.post("/turmas", json={"nome": "Música"}, headers=h_prof).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof).json()
    client.post("/turmas/entrar", json={"codigo_turma": turma["codigo_turma"]}, headers=h_aluno)
    client.post("/aulas/entrar", json={"codigo_aula": aula["codigo_aula"]}, headers=h_aluno)

    r = client.post(f"/aulas/{aula['id']}/foco", json={"foco_segundos": 42}, headers=h_aluno)
    assert r.status_code == 204, r.text

    # reenvio com valor maior -- é um "set", não soma, e não deve dar erro
    r = client.post(f"/aulas/{aula['id']}/foco", json={"foco_segundos": 90}, headers=h_aluno)
    assert r.status_code == 204, r.text


def test_reportar_foco_sem_participar_da_aula_da_404(client: TestClient):
    h_prof = _cadastrar_professor(client, "prof11@escola.com")
    h_aluno = _cadastrar_aluno(client, "aluno11@escola.com")
    turma = client.post("/turmas", json={"nome": "Teatro"}, headers=h_prof).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof).json()

    r = client.post(f"/aulas/{aula['id']}/foco", json={"foco_segundos": 10}, headers=h_aluno)
    assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# Auto-encerramento de aula esquecida (parada demais no mesmo modo)
# ---------------------------------------------------------------------------


def _forcar_modo_atualizado_em(session: Session, aula_id: int, ha_quanto_tempo: timedelta) -> None:
    """Simula uma aula que ficou parada no modo atual por `ha_quanto_tempo`,
    sem precisar esperar de verdade -- backdata o carimbo direto no banco,
    do jeito que só o backend consegue (não existe endpoint pra isso)."""
    aula = session.get(Aula, aula_id)
    assert aula is not None
    aula.modo_atualizado_em = datetime.utcnow() - ha_quanto_tempo
    session.add(aula)
    session.commit()


def test_aula_parada_mais_de_1h_no_modo_livre_e_encerrada_sozinha(client: TestClient, session: Session):
    h_prof = _cadastrar_professor(client, "prof12@escola.com")
    turma = client.post("/turmas", json={"nome": "Sociologia"}, headers=h_prof).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof).json()

    # entra em livre "de verdade" (marca em_andamento + carimba modo_atualizado_em)
    client.post(f"/aulas/{aula['id']}/modo", json={"modo": "livre"}, headers=h_prof)
    _forcar_modo_atualizado_em(session, aula["id"], timedelta(hours=1, minutes=5))

    r = client.get(f"/aulas/{aula['id']}", headers=h_prof)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "encerrada"


def test_aula_recente_no_modo_livre_nao_e_encerrada(client: TestClient, session: Session):
    """A garantia mais importante do recurso: NUNCA fechar uma aula que está
    realmente em uso. 50min parado em Livre ainda é normal dentro de uma aula."""
    h_prof = _cadastrar_professor(client, "prof13@escola.com")
    turma = client.post("/turmas", json={"nome": "Filosofia"}, headers=h_prof).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof).json()

    client.post(f"/aulas/{aula['id']}/modo", json={"modo": "livre"}, headers=h_prof)
    _forcar_modo_atualizado_em(session, aula["id"], timedelta(minutes=50))

    r = client.get(f"/aulas/{aula['id']}", headers=h_prof)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "em_andamento"


def test_modo_foco_tem_limite_maior_que_modo_livre(client: TestClient, session: Session):
    """Foco cobre uma explicação teórica inteira (a própria proposta do produto
    fala em até 50min) -- por isso tem uma folga maior que o Livre antes de
    ser considerado abandonado."""
    h_prof = _cadastrar_professor(client, "prof14@escola.com")
    turma = client.post("/turmas", json={"nome": "Biologia"}, headers=h_prof).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof).json()

    client.post(f"/aulas/{aula['id']}/modo", json={"modo": "foco"}, headers=h_prof)

    # Passou de 1h (limite do Livre) mas ainda não passou de 1h30 (limite do Foco)
    _forcar_modo_atualizado_em(session, aula["id"], timedelta(hours=1, minutes=15))
    r = client.get(f"/aulas/{aula['id']}", headers=h_prof)
    assert r.json()["status"] == "em_andamento", "não devia ter usado o limite do Livre pro Foco"

    _forcar_modo_atualizado_em(session, aula["id"], timedelta(hours=1, minutes=35))
    r = client.get(f"/aulas/{aula['id']}", headers=h_prof)
    assert r.json()["status"] == "encerrada"


def test_listar_aulas_da_turma_tambem_auto_encerra_aula_abandonada(client: TestClient, session: Session):
    h_prof = _cadastrar_professor(client, "prof15@escola.com")
    turma = client.post("/turmas", json={"nome": "Espanhol"}, headers=h_prof).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof).json()

    client.post(f"/aulas/{aula['id']}/modo", json={"modo": "livre"}, headers=h_prof)
    _forcar_modo_atualizado_em(session, aula["id"], timedelta(hours=2))

    r = client.get(f"/aulas/turma/{turma['id']}", headers=h_prof)
    assert r.status_code == 200, r.text
    assert r.json()[0]["status"] == "encerrada"


def test_aluno_que_entra_numa_aula_abandonada_recebe_ela_ja_encerrada(client: TestClient, session: Session):
    """Sem isso, o aluno entraria numa aula "zumbi" que o professor esqueceu
    aberta -- em vez de erro, ele só vê a tela normal de aula encerrada."""
    h_prof = _cadastrar_professor(client, "prof16@escola.com")
    h_aluno = _cadastrar_aluno(client, "aluno12@escola.com")
    turma = client.post("/turmas", json={"nome": "Robótica"}, headers=h_prof).json()
    aula = client.post("/aulas", json={"turma_id": turma["id"], "titulo": "Aula 1"}, headers=h_prof).json()
    client.post("/turmas/entrar", json={"codigo_turma": turma["codigo_turma"]}, headers=h_aluno)

    client.post(f"/aulas/{aula['id']}/modo", json={"modo": "livre"}, headers=h_prof)
    _forcar_modo_atualizado_em(session, aula["id"], timedelta(hours=3))

    r = client.post("/aulas/entrar", json={"codigo_aula": aula["codigo_aula"]}, headers=h_aluno)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "encerrada"
