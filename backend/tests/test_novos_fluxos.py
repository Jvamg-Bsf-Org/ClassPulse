from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import Aluno, Aula, Matricula, Participacao, Professor, Turma


def test_aluno_sair_da_turma_e_historico(
    client: TestClient,
    session: Session,
    professor_auth: tuple[Professor, dict[str, str]],
    alunos_auth: list[tuple[Aluno, dict[str, str]]],
):
    prof, prof_headers = professor_auth
    aluno, aluno_headers = alunos_auth[0]

    # Criar turma
    turma = Turma(nome="Física 1", codigo_turma="FIS101", professor_id=prof.id)
    session.add(turma)
    session.commit()
    session.refresh(turma)

    # Matricular aluno
    mat = Matricula(turma_id=turma.id, aluno_id=aluno.id)
    session.add(mat)

    # Criar aula com participação
    aula = Aula(turma_id=turma.id, titulo="Cinemática", codigo_aula="CIN01")
    session.add(aula)
    session.commit()
    session.refresh(aula)

    part = Participacao(aula_id=aula.id, aluno_id=aluno.id, score_foco_segundos=120, score_aprendizagem=85)
    session.add(part)
    session.commit()

    # Histórico do aluno deve conter a aula
    res = client.get("/alunos/historico", headers=aluno_headers)
    assert res.status_code == 200
    historico = res.json()
    assert len(historico) == 1
    assert historico[0]["aula_id"] == aula.id
    assert historico[0]["turma_nome"] == "Física 1"
    assert historico[0]["score_foco_segundos"] == 120
    assert historico[0]["score_aprendizagem"] == 85

    # Aluno sai da turma
    res_sair = client.post(f"/turmas/{turma.id}/sair", headers=aluno_headers)
    assert res_sair.status_code == 200

    # Aluno tenta sair novamente -> 404
    res_sair2 = client.post(f"/turmas/{turma.id}/sair", headers=aluno_headers)
    assert res_sair2.status_code == 404

    # Turma não deve mais aparecer em matriculadas
    res_mat = client.get("/turmas/matriculadas", headers=aluno_headers)
    assert res_mat.status_code == 200
    turma_ids = [t["id"] for t in res_mat.json()]
    assert turma.id not in turma_ids


def test_professor_exclui_turma_em_cascata(
    client: TestClient,
    session: Session,
    professor_auth: tuple[Professor, dict[str, str]],
    alunos_auth: list[tuple[Aluno, dict[str, str]]],
):
    prof, prof_headers = professor_auth
    aluno, aluno_headers = alunos_auth[0]

    # Criar turma
    turma = Turma(nome="Química Geral", codigo_turma="QUI101", professor_id=prof.id)
    session.add(turma)
    session.commit()
    session.refresh(turma)

    # Matricular aluno
    mat = Matricula(turma_id=turma.id, aluno_id=aluno.id)
    session.add(mat)
    session.commit()

    # Verificar que aluno vê a turma
    res_mat = client.get("/turmas/matriculadas", headers=aluno_headers)
    assert any(t["id"] == turma.id for t in res_mat.json())

    # Professor exclui a turma
    res_del = client.delete(f"/turmas/{turma.id}", headers=prof_headers)
    assert res_del.status_code == 204

    # Turma sumiu automaticamente para o aluno
    res_mat2 = client.get("/turmas/matriculadas", headers=aluno_headers)
    assert not any(t["id"] == turma.id for t in res_mat2.json())

    # Turma sumiu para o professor
    res_prof_t = client.get("/turmas/minhas", headers=prof_headers)
    assert not any(t["id"] == turma.id for t in res_prof_t.json())


def test_quizzes_por_turma_e_metricas_professor(
    client: TestClient,
    session: Session,
    professor_auth: tuple[Professor, dict[str, str]],
    alunos_auth: list[tuple[Aluno, dict[str, str]]],
):
    prof, prof_headers = professor_auth
    aluno, aluno_headers = alunos_auth[0]

    # Criar turma
    turma = Turma(nome="História", codigo_turma="HIS101", professor_id=prof.id)
    session.add(turma)
    session.commit()
    session.refresh(turma)

    # Matricular aluno
    mat = Matricula(turma_id=turma.id, aluno_id=aluno.id)
    session.add(mat)

    # Criar aula
    aula = Aula(turma_id=turma.id, titulo="Brasil Colônia", codigo_aula="BRA01")
    session.add(aula)
    session.commit()
    session.refresh(aula)

    part = Participacao(aula_id=aula.id, aluno_id=aluno.id, score_foco_segundos=300, score_aprendizagem=90)
    session.add(part)
    session.commit()

    # Criar quiz vinculado à turma
    quiz_data = {
        "turma_id": turma.id,
        "titulo": "Quiz Brasil Colonial",
        "descricao": "Perguntas sobre o período colonial",
        "modo_execucao": "individual",
        "competitivo": False,
        "obrigatorio": True,
        "perguntas": [
            {
                "enunciado": "Em que ano ocorreu a chegada dos portugueses?",
                "tipo": "multipla_escolha",
                "pontos": 100,
                "alternativas": [
                    {"texto": "1500", "correta": True},
                    {"texto": "1822", "correta": False},
                ],
            }
        ],
    }
    res_q = client.post("/quizzes", json=quiz_data, headers=prof_headers)
    assert res_q.status_code == 201
    quiz_resp = res_q.json()
    assert quiz_resp["turma_id"] == turma.id

    # Listar quizzes da turma
    res_list = client.get(f"/quizzes/turma/{turma.id}", headers=prof_headers)
    assert res_list.status_code == 200
    quizzes = res_list.json()
    assert len(quizzes) == 1
    assert quizzes[0]["titulo"] == "Quiz Brasil Colonial"
    assert quizzes[0]["turma_id"] == turma.id

    # Métricas do professor
    res_metr = client.get("/professores/metricas", headers=prof_headers)
    assert res_metr.status_code == 200
    metr = res_metr.json()
    assert metr["total_turmas"] >= 1
    assert metr["total_aulas"] >= 1
    assert metr["total_alunos"] >= 1
    assert metr["media_foco_geral_segundos"] > 0
    assert metr["media_atividades_geral"] == 90.0

    # Estatísticas da turma
    res_est = client.get(f"/professores/turmas/{turma.id}/estatisticas", headers=prof_headers)
    assert res_est.status_code == 200
    est = res_est.json()
    assert est["total_alunos"] == 1
    assert est["total_aulas"] == 1
    assert est["media_foco_segundos"] == 300.0
    assert est["media_atividade"] == 90.0
    assert len(est["alunos"]) == 1
    assert est["alunos"][0]["id"] == aluno.id
