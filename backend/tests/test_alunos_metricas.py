from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import Aluno, Aula, Matricula, Participacao, Professor, Turma


def test_aluno_metricas_e_detalhes_turma(
    client: TestClient,
    session: Session,
    professor_auth: tuple[Professor, dict[str, str]],
    alunos_auth: list[tuple[Aluno, dict[str, str]]],
):
    prof, prof_headers = professor_auth
    aluno, aluno_headers = alunos_auth[0]

    # Metricas iniciais vazias
    res = client.get("/alunos/metricas", headers=aluno_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_turmas"] == 0
    assert data["total_aulas_participadas"] == 0
    assert data["media_foco_segundos"] == 0.0
    assert data["media_atividade"] == 0.0

    # Criar turma e aula
    turma = Turma(nome="Matemática", codigo_turma="MAT101", professor_id=prof.id)
    session.add(turma)
    session.commit()
    session.refresh(turma)

    aula1 = Aula(turma_id=turma.id, titulo="Álgebra", codigo_aula="ALG01")
    aula2 = Aula(turma_id=turma.id, titulo="Geometria", codigo_aula="GEO01")
    session.add_all([aula1, aula2])
    session.commit()
    session.refresh(aula1)
    session.refresh(aula2)

    # Aluno tenta ver turma sem matrícula -> 403
    res = client.get(f"/alunos/turmas/{turma.id}/detalhes", headers=aluno_headers)
    assert res.status_code == 403

    # Matricular aluno
    matricula = Matricula(turma_id=turma.id, aluno_id=aluno.id)
    session.add(matricula)
    session.commit()

    # Agora consegue ver detalhes da turma
    res = client.get(f"/alunos/turmas/{turma.id}/detalhes", headers=aluno_headers)
    assert res.status_code == 200
    detalhes = res.json()
    assert detalhes["turma"]["id"] == turma.id
    assert detalhes["total_aulas"] == 2
    assert detalhes["aulas_participadas"] == 0
    assert len(detalhes["aulas"]) == 2

    # Aluno pode listar aulas da turma
    res = client.get(f"/aulas/turma/{turma.id}", headers=aluno_headers)
    assert res.status_code == 200
    assert len(res.json()) == 2

    # Participar de aula 1 com foco 120s e aprendizagem 80
    part = Participacao(
        aula_id=aula1.id,
        aluno_id=aluno.id,
        score_foco_segundos=120,
        score_aprendizagem=80,
    )
    session.add(part)
    session.commit()

    # Verificar métricas gerais
    res = client.get("/alunos/metricas", headers=aluno_headers)
    assert res.status_code == 200
    metricas = res.json()
    assert metricas["total_turmas"] == 1
    assert metricas["total_aulas_participadas"] == 1
    assert metricas["total_foco_segundos"] == 120
    assert metricas["media_foco_segundos"] == 120.0
    assert metricas["media_atividade"] == 80.0

    # Verificar métricas da turma
    res = client.get(f"/alunos/turmas/{turma.id}/detalhes", headers=aluno_headers)
    assert res.status_code == 200
    detalhes = res.json()
    assert detalhes["aulas_participadas"] == 1
    assert detalhes["media_foco_segundos"] == 120.0
    assert detalhes["media_atividade"] == 80.0
    # Aula 1 marcada como participada
    aula1_det = next(a for a in detalhes["aulas"] if a["id"] == aula1.id)
    assert aula1_det["participou"] is True
    assert aula1_det["score_foco_segundos"] == 120
    assert aula1_det["score_aprendizagem"] == 80
