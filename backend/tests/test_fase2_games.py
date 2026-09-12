from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import Aula, ModoAula, Participacao, Partida, StatusPartida


def _criar_quiz_exemplo(client: TestClient, prof_headers: dict[str, str]) -> int:
    payload = {
        "titulo": "Quiz de Triângulos",
        "descricao": "Perguntas de fixação",
        "modo_execucao": "individual",
        "competitivo": False,
        "obrigatorio": True,
        "meta_coletiva_percentual": 80,
        "perguntas": [
            {
                "enunciado": "Quantos lados tem um triângulo?",
                "tipo": "multipla_escolha",
                "ordem": 0,
                "pontos": 100,
                "explicacao": "Triângulos têm exatamente 3 lados.",
                "alternativas": [
                    {"texto": "3", "correta": True},
                    {"texto": "4", "correta": False},
                ],
            },
            {
                "enunciado": "A soma dos ângulos internos é 180 graus?",
                "tipo": "verdadeiro_falso",
                "ordem": 1,
                "pontos": 100,
                "explicacao": "Sim, em geometria euclidiana plana.",
                "alternativas": [
                    {"texto": "Verdadeiro", "correta": True},
                    {"texto": "Falso", "correta": False},
                ],
            },
        ],
    }
    res = client.post("/quizzes", json=payload, headers=prof_headers)
    assert res.status_code == 201
    return res.json()["id"]


def test_criar_e_listar_quizzes(client: TestClient, professor_auth):
    _, prof_headers = professor_auth
    quiz_id = _criar_quiz_exemplo(client, prof_headers)

    res = client.get("/quizzes/meus", headers=prof_headers)
    assert res.status_code == 200
    quizzes = res.json()
    assert len(quizzes) == 1
    assert quizzes[0]["id"] == quiz_id
    assert quizzes[0]["total_perguntas"] == 2

    # Obter detalhes com perguntas
    res_det = client.get(f"/quizzes/{quiz_id}", headers=prof_headers)
    assert res_det.status_code == 200
    detalhes = res_det.json()
    assert len(detalhes["perguntas"]) == 2
    assert len(detalhes["perguntas"][0]["alternativas"]) == 2


def test_partida_individual_fluxo_completo(
    client: TestClient,
    session: Session,
    professor_auth,
    alunos_auth,
    aula_com_alunos: Aula,
):
    _, prof_headers = professor_auth
    aluno1, aluno1_headers = alunos_auth[0]
    quiz_id = _criar_quiz_exemplo(client, prof_headers)

    # 1. Iniciar partida
    res_ini = client.post(
        f"/partidas/aula/{aula_com_alunos.id}/iniciar",
        json={"quiz_id": quiz_id, "modo_execucao": "individual", "tempo_limite_segundos": 600},
        headers=prof_headers,
    )
    assert res_ini.status_code == 200
    partida_id = res_ini.json()["id"]

    # Verificar que modo da aula mudou para atividade
    session.refresh(aula_com_alunos)
    assert aula_com_alunos.modo_atual == ModoAula.atividade

    # 2. Aluno busca status da partida
    res_aluno = client.get(
        f"/partidas/aula/{aula_com_alunos.id}/aluno-status",
        headers=aluno1_headers,
    )
    assert res_aluno.status_code == 200
    dados_aluno = res_aluno.json()
    assert dados_aluno["id"] == partida_id
    assert len(dados_aluno["perguntas"]) == 2
    p1 = dados_aluno["perguntas"][0]
    p2 = dados_aluno["perguntas"][1]

    # As alternativas para o aluno NÃO devem vazar 'correta'
    assert "correta" not in p1["alternativas"][0]

    # Pegar alternativa correta da p1 e incorreta da p2 pelo banco
    alt1_correta = p1["alternativas"][0]["id"] if p1["alternativas"][0]["texto"] == "3" else p1["alternativas"][1]["id"]
    alt2_incorreta = p2["alternativas"][0]["id"] if p2["alternativas"][0]["texto"] == "Falso" else p2["alternativas"][1]["id"]

    # 3. Aluno envia respostas
    res_resp1 = client.post(
        f"/partidas/{partida_id}/responder",
        json={"pergunta_id": p1["id"], "alternativa_id": alt1_correta},
        headers=aluno1_headers,
    )
    assert res_resp1.status_code == 200
    assert res_resp1.json()["salva"] is True

    res_resp2 = client.post(
        f"/partidas/{partida_id}/responder",
        json={"pergunta_id": p2["id"], "alternativa_id": alt2_incorreta},
        headers=aluno1_headers,
    )
    assert res_resp2.status_code == 200

    # 4. Professor acompanha métricas ao vivo
    res_prof = client.get(
        f"/partidas/{partida_id}/professor-status",
        headers=prof_headers,
    )
    assert res_prof.status_code == 200
    status_prof = res_prof.json()
    assert status_prof["total_respostas_recebidas"] == 2
    assert status_prof["total_acertos"] == 1
    assert status_prof["percentual_acertos_atual"] == 50.0

    # 5. Professor encerra a partida
    res_fim = client.post(
        f"/partidas/{partida_id}/encerrar",
        headers=prof_headers,
    )
    assert res_fim.status_code == 200

    # Verificar que modo da aula voltou para livre
    session.refresh(aula_com_alunos)
    assert aula_com_alunos.modo_atual == ModoAula.livre

    # Verificar que score_aprendizagem foi atualizado para 50 (1 acerto de 2 questões)
    # e que score_foco_segundos permaneceu intacto (1800s)
    part = session.exec(
        select(Participacao).where(
            Participacao.aula_id == aula_com_alunos.id,
            Participacao.aluno_id == aluno1.id,
        )
    ).first()
    assert part.score_aprendizagem == 50
    assert part.score_foco_segundos == 1800

    # 6. Aluno consulta resultados pós-encerramento e recebe gabarito completo
    res_resul = client.get(
        f"/partidas/{partida_id}/resultados",
        headers=aluno1_headers,
    )
    assert res_resul.status_code == 200
    resultado = res_resul.json()
    assert resultado["acertos_individual"] == 1
    assert resultado["pontuacao_individual"] == 100
    assert len(resultado["gabarito"]) == 2
    assert resultado["gabarito"][0]["explicacao"] is not None


def test_partida_em_grupo_trava_60s_e_sincronizacao(
    client: TestClient,
    session: Session,
    professor_auth,
    alunos_auth,
    aula_com_alunos: Aula,
):
    _, prof_headers = professor_auth
    aluno1, aluno1_headers = alunos_auth[0]
    aluno2, aluno2_headers = alunos_auth[1]
    quiz_id = _criar_quiz_exemplo(client, prof_headers)

    # Iniciar partida em grupo
    res_ini = client.post(
        f"/partidas/aula/{aula_com_alunos.id}/iniciar",
        json={"quiz_id": quiz_id, "modo_execucao": "grupo"},
        headers=prof_headers,
    )
    assert res_ini.status_code == 200
    partida_id = res_ini.json()["id"]

    # Aluno 1 consulta status: deve ter grupo e segundos de discussão
    res_st = client.get(
        f"/partidas/aula/{aula_com_alunos.id}/aluno-status",
        headers=aluno1_headers,
    )
    assert res_st.status_code == 200
    st_aluno = res_st.json()
    assert st_aluno["modo_execucao"] == "grupo"
    assert st_aluno["segundos_discussao_restantes"] > 0
    assert st_aluno["pode_enviar_resposta"] is False
    pergunta_id = st_aluno["perguntas"][0]["id"]
    alt_id = st_aluno["perguntas"][0]["alternativas"][0]["id"]

    # Tentativa de responder dentro dos 60 segundos deve falhar com HTTP 400
    res_bloq = client.post(
        f"/partidas/{partida_id}/responder",
        json={"pergunta_id": pergunta_id, "alternativa_id": alt_id},
        headers=aluno1_headers,
    )
    assert res_bloq.status_code == 400
    assert "Aguarde o período de discussão presencial" in res_bloq.json()["detail"]

    # Simular passagem dos 60 segundos alterando discussao_ate para o passado no banco
    partida_db = session.get(Partida, partida_id)
    partida_db.discussao_ate = datetime.utcnow() - timedelta(seconds=1)
    session.add(partida_db)
    session.commit()

    # Agora o envio deve ser permitido por qualquer membro
    res_ok = client.post(
        f"/partidas/{partida_id}/responder",
        json={"pergunta_id": pergunta_id, "alternativa_id": alt_id},
        headers=aluno1_headers,
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["salva"] is True

    # Se aluno 2 (caso esteja na mesma equipe) consultar, vê a resposta compartilhada
    res_aluno2 = client.get(
        f"/partidas/aula/{aula_com_alunos.id}/aluno-status",
        headers=aluno2_headers,
    )
    assert res_aluno2.status_code == 200


def test_partida_opcional_pular_preserva_foco(
    client: TestClient,
    session: Session,
    professor_auth,
    alunos_auth,
    aula_com_alunos: Aula,
):
    _, prof_headers = professor_auth
    aluno1, aluno1_headers = alunos_auth[0]
    quiz_id = _criar_quiz_exemplo(client, prof_headers)

    # Iniciar partida opcional
    res_ini = client.post(
        f"/partidas/aula/{aula_com_alunos.id}/iniciar",
        json={"quiz_id": quiz_id, "obrigatorio": False},
        headers=prof_headers,
    )
    assert res_ini.status_code == 200
    partida_id = res_ini.json()["id"]

    # Aluno pula a atividade
    res_pulo = client.post(
        f"/partidas/{partida_id}/pular",
        headers=aluno1_headers,
    )
    assert res_pulo.status_code == 200
    assert "Seu Score de Foco está preservado" in res_pulo.json()["mensagem"]

    # Professor encerra
    client.post(f"/partidas/{partida_id}/encerrar", headers=prof_headers)

    # Aluno que pulou não teve seu foco reduzido nem score de aprendizagem penalizado
    part = session.exec(
        select(Participacao).where(
            Participacao.aula_id == aula_com_alunos.id,
            Participacao.aluno_id == aluno1.id,
        )
    ).first()
    assert part.score_foco_segundos == 1800
    assert part.score_aprendizagem == 0


def test_partida_cooperativa_meta_atingida(
    client: TestClient,
    session: Session,
    professor_auth,
    alunos_auth,
    aula_com_alunos: Aula,
):
    _, prof_headers = professor_auth
    aluno1, aluno1_headers = alunos_auth[0]
    quiz_id = _criar_quiz_exemplo(client, prof_headers)

    # Iniciar partida cooperativa com meta de 80%
    res_ini = client.post(
        f"/partidas/aula/{aula_com_alunos.id}/iniciar",
        json={"quiz_id": quiz_id, "competitivo": False, "meta_coletiva_percentual": 80},
        headers=prof_headers,
    )
    partida_id = res_ini.json()["id"]

    # Obter perguntas
    res_aluno = client.get(
        f"/partidas/aula/{aula_com_alunos.id}/aluno-status",
        headers=aluno1_headers,
    )
    p1 = res_aluno.json()["perguntas"][0]
    p2 = res_aluno.json()["perguntas"][1]
    alt1_correta = p1["alternativas"][0]["id"] if p1["alternativas"][0]["texto"] == "3" else p1["alternativas"][1]["id"]
    alt2_correta = p2["alternativas"][0]["id"] if p2["alternativas"][0]["texto"] == "Verdadeiro" else p2["alternativas"][1]["id"]

    # Aluno 1 acerta 100% das perguntas
    client.post(
        f"/partidas/{partida_id}/responder",
        json={"pergunta_id": p1["id"], "alternativa_id": alt1_correta},
        headers=aluno1_headers,
    )
    client.post(
        f"/partidas/{partida_id}/responder",
        json={"pergunta_id": p2["id"], "alternativa_id": alt2_correta},
        headers=aluno1_headers,
    )

    # Professor encerra e verifica que meta foi superada (100% >= 80%)
    res_fim = client.post(f"/partidas/{partida_id}/encerrar", headers=prof_headers)
    assert res_fim.status_code == 200
    resul = res_fim.json()
    assert resul["meta_coletiva_atingida"] is True
    assert resul["percentual_turma"] == 100.0


def test_partida_competitiva_ranking(
    client: TestClient,
    session: Session,
    professor_auth,
    alunos_auth,
    aula_com_alunos: Aula,
):
    _, prof_headers = professor_auth
    aluno1, aluno1_headers = alunos_auth[0]
    aluno2, aluno2_headers = alunos_auth[1]
    quiz_id = _criar_quiz_exemplo(client, prof_headers)

    # Iniciar partida competitiva
    res_ini = client.post(
        f"/partidas/aula/{aula_com_alunos.id}/iniciar",
        json={"quiz_id": quiz_id, "competitivo": True},
        headers=prof_headers,
    )
    partida_id = res_ini.json()["id"]

    # Obter perguntas
    res_aluno = client.get(
        f"/partidas/aula/{aula_com_alunos.id}/aluno-status",
        headers=aluno1_headers,
    )
    p1 = res_aluno.json()["perguntas"][0]
    p2 = res_aluno.json()["perguntas"][1]
    alt1_correta = p1["alternativas"][0]["id"] if p1["alternativas"][0]["texto"] == "3" else p1["alternativas"][1]["id"]
    alt2_correta = p2["alternativas"][0]["id"] if p2["alternativas"][0]["texto"] == "Verdadeiro" else p2["alternativas"][1]["id"]
    alt2_incorreta = p2["alternativas"][0]["id"] if p2["alternativas"][0]["texto"] == "Falso" else p2["alternativas"][1]["id"]

    # Aluno 1 acerta as 2 perguntas (200 pts)
    client.post(f"/partidas/{partida_id}/responder", json={"pergunta_id": p1["id"], "alternativa_id": alt1_correta}, headers=aluno1_headers)
    client.post(f"/partidas/{partida_id}/responder", json={"pergunta_id": p2["id"], "alternativa_id": alt2_correta}, headers=aluno1_headers)

    # Aluno 2 acerta apenas 1 pergunta (100 pts)
    client.post(f"/partidas/{partida_id}/responder", json={"pergunta_id": p1["id"], "alternativa_id": alt1_correta}, headers=aluno2_headers)
    client.post(f"/partidas/{partida_id}/responder", json={"pergunta_id": p2["id"], "alternativa_id": alt2_incorreta}, headers=aluno2_headers)

    # Professor encerra e verifica ranking ordenado
    res_fim = client.post(f"/partidas/{partida_id}/encerrar", headers=prof_headers)
    assert res_fim.status_code == 200
    ranking = res_fim.json()["ranking"]
    assert ranking is not None
    assert len(ranking) >= 2
    assert ranking[0]["posicao"] == 1
    assert ranking[0]["pontos"] == 200
    assert ranking[1]["posicao"] == 2
    assert ranking[1]["pontos"] == 100

