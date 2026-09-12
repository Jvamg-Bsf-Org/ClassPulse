from collections.abc import Generator
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.core.config import settings
from app.core.security import create_access_token
from app.db import get_session
from app.main import app
from app.models import Aluno, Aula, ModoAula, Participacao, Professor, StatusAula, Turma


@pytest.fixture(autouse=True)
def _cookie_sem_secure(monkeypatch: pytest.MonkeyPatch) -> None:
    """TestClient roda sobre http://testserver, não https — um cookie com
    Secure nunca voltaria no request seguinte. Em prod isso continua True
    (via env var), aqui só afeta a suíte de teste."""
    monkeypatch.setattr(settings, "refresh_cookie_secure", False)


@pytest.fixture(name="session")
def session_fixture() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session) -> Generator[TestClient, None, None]:
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="professor_auth")
def professor_auth_fixture(session: Session) -> tuple[Professor, dict[str, str]]:
    prof = Professor(
        nome="Professor Girafales",
        email="girafales@escola.com",
        senha_hash="hash_teste",
    )
    session.add(prof)
    session.commit()
    session.refresh(prof)

    token = create_access_token(subject=prof.id, tipo="professor")
    headers = {"Authorization": f"Bearer {token}"}
    return prof, headers


@pytest.fixture(name="alunos_auth")
def alunos_auth_fixture(session: Session) -> list[tuple[Aluno, dict[str, str]]]:
    alunos = []
    for i in range(1, 4):
        aluno = Aluno(
            nome=f"Aluno {i}",
            email=f"aluno{i}@escola.com",
            senha_hash="hash_teste",
        )
        session.add(aluno)
        session.commit()
        session.refresh(aluno)
        token = create_access_token(subject=aluno.id, tipo="aluno")
        headers = {"Authorization": f"Bearer {token}"}
        alunos.append((aluno, headers))
    return alunos



@pytest.fixture(name="aula_com_alunos")
def aula_fixture(
    session: Session,
    professor_auth: tuple[Professor, dict[str, str]],
    alunos_auth: list[tuple[Aluno, dict[str, str]]],
) -> Aula:
    prof, _ = professor_auth
    turma = Turma(
        nome="Matemática 101",
        codigo_turma="MAT101",
        professor_id=prof.id,
    )
    session.add(turma)
    session.commit()
    session.refresh(turma)

    aula = Aula(
        turma_id=turma.id,
        titulo="Aula 1 - Geometria",
        codigo_aula="GEO001",
        modo_atual=ModoAula.foco,
        status=StatusAula.em_andamento,
    )
    session.add(aula)
    session.commit()
    session.refresh(aula)

    for aluno, _ in alunos_auth:
        participacao = Participacao(
            aula_id=aula.id,
            aluno_id=aluno.id,
            score_foco_segundos=1800,
            score_aprendizagem=0,
        )
        session.add(participacao)
    session.commit()

    return aula
