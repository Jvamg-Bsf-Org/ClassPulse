from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel


class ModoAula(str, Enum):
    livre = "livre"
    foco = "foco"
    atividade = "atividade"


class StatusAula(str, Enum):
    nao_iniciada = "nao_iniciada"
    em_andamento = "em_andamento"
    encerrada = "encerrada"


class TipoPergunta(str, Enum):
    multipla_escolha = "multipla_escolha"
    verdadeiro_falso = "verdadeiro_falso"
    aberta = "aberta"


class ModoExecucaoQuiz(str, Enum):
    individual = "individual"
    grupo = "grupo"


class Professor(SQLModel, table=True):
    __tablename__ = "professores"

    id: int | None = Field(default=None, primary_key=True)
    nome: str
    email: str = Field(unique=True, index=True)
    senha_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Aluno(SQLModel, table=True):
    __tablename__ = "alunos"

    id: int | None = Field(default=None, primary_key=True)
    nome: str
    email: str = Field(unique=True, index=True)
    senha_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Turma(SQLModel, table=True):
    __tablename__ = "turmas"

    id: int | None = Field(default=None, primary_key=True)
    professor_id: int = Field(foreign_key="professores.id", index=True)
    nome: str
    codigo_turma: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Matricula(SQLModel, table=True):
    __tablename__ = "matriculas"
    __table_args__ = {"sqlite_autoincrement": True}

    id: int | None = Field(default=None, primary_key=True)
    turma_id: int = Field(foreign_key="turmas.id", index=True)
    aluno_id: int = Field(foreign_key="alunos.id", index=True)
    matriculado_em: datetime = Field(default_factory=datetime.utcnow)


class Aula(SQLModel, table=True):
    __tablename__ = "aulas"

    id: int | None = Field(default=None, primary_key=True)
    turma_id: int = Field(foreign_key="turmas.id", index=True)
    titulo: str
    codigo_aula: str = Field(unique=True, index=True)
    modo_atual: ModoAula = Field(default=ModoAula.livre)
    status: StatusAula = Field(default=StatusAula.nao_iniciada)
    iniciada_em: datetime | None = Field(default=None)
    encerrada_em: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Participacao(SQLModel, table=True):
    __tablename__ = "participacoes"

    id: int | None = Field(default=None, primary_key=True)
    aula_id: int = Field(foreign_key="aulas.id", index=True)
    aluno_id: int = Field(foreign_key="alunos.id", index=True)
    entrou_em: datetime = Field(default_factory=datetime.utcnow)
    score_foco_segundos: int = Field(default=0)
    score_aprendizagem: int = Field(default=0)


class Quiz(SQLModel, table=True):
    __tablename__ = "quizzes"

    id: int | None = Field(default=None, primary_key=True)
    aula_id: int = Field(foreign_key="aulas.id", index=True)
    titulo: str
    modo_execucao: ModoExecucaoQuiz = Field(default=ModoExecucaoQuiz.individual)
    competitivo: bool = Field(default=False)
    obrigatorio: bool = Field(default=True)
    meta_coletiva_percentual: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Pergunta(SQLModel, table=True):
    __tablename__ = "perguntas"

    id: int | None = Field(default=None, primary_key=True)
    quiz_id: int = Field(foreign_key="quizzes.id", index=True)
    enunciado: str
    tipo: TipoPergunta = Field(default=TipoPergunta.multipla_escolha)
    ordem: int = Field(default=0)


class Alternativa(SQLModel, table=True):
    __tablename__ = "alternativas"

    id: int | None = Field(default=None, primary_key=True)
    pergunta_id: int = Field(foreign_key="perguntas.id", index=True)
    texto: str
    correta: bool = Field(default=False)


class Grupo(SQLModel, table=True):
    __tablename__ = "grupos"

    id: int | None = Field(default=None, primary_key=True)
    quiz_id: int = Field(foreign_key="quizzes.id", index=True)
    nome_ou_numero: str


class GrupoMembro(SQLModel, table=True):
    __tablename__ = "grupo_membros"

    grupo_id: int = Field(foreign_key="grupos.id", primary_key=True)
    participacao_id: int = Field(foreign_key="participacoes.id", primary_key=True)


class Resposta(SQLModel, table=True):
    __tablename__ = "respostas"

    id: int | None = Field(default=None, primary_key=True)
    pergunta_id: int = Field(foreign_key="perguntas.id", index=True)
    participacao_id: int | None = Field(default=None, foreign_key="participacoes.id", index=True)
    grupo_id: int | None = Field(default=None, foreign_key="grupos.id", index=True)
    alternativa_id: int | None = Field(default=None, foreign_key="alternativas.id")
    resposta_texto: str | None = Field(default=None)
    correta: bool | None = Field(default=None)
    respondido_em: datetime = Field(default_factory=datetime.utcnow)
