from datetime import datetime

from pydantic import BaseModel, EmailStr


class ProfessorCreate(BaseModel):
    nome: str
    email: EmailStr
    senha: str


class ProfessorRead(BaseModel):
    id: int
    nome: str
    email: EmailStr


class AlunoCreate(BaseModel):
    nome: str
    email: EmailStr
    senha: str


class AlunoRead(BaseModel):
    id: int
    nome: str
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    senha: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tipo: str


class TurmaCreate(BaseModel):
    nome: str


class TurmaRead(BaseModel):
    id: int
    nome: str
    codigo_turma: str
    professor_id: int
    created_at: datetime


class TurmaEntrarRequest(BaseModel):
    codigo_turma: str


# ==========================================
# Aulas + Modo Foco
# ==========================================
from app.models import ModoAula, StatusAula


class AulaCreate(BaseModel):
    turma_id: int
    titulo: str


class AulaRead(BaseModel):
    id: int
    turma_id: int
    titulo: str
    codigo_aula: str
    modo_atual: ModoAula
    status: StatusAula
    iniciada_em: datetime | None = None
    encerrada_em: datetime | None = None
    created_at: datetime


class AulaEntrarRequest(BaseModel):
    codigo_aula: str


class AulaModoRequest(BaseModel):
    modo: ModoAula


class FocoScoreRequest(BaseModel):
    foco_segundos: int


# ==========================================
# Fase 2: Schemas para Quizzes e Jogos
# ==========================================
from app.models import ModoExecucaoQuiz, StatusPartida, TipoPergunta


class AlternativaCreate(BaseModel):
    texto: str
    correta: bool = False


class AlternativaRead(BaseModel):
    id: int
    texto: str
    correta: bool


class AlternativaAlunoRead(BaseModel):
    id: int
    texto: str


class PerguntaCreate(BaseModel):
    enunciado: str
    tipo: TipoPergunta = TipoPergunta.multipla_escolha
    ordem: int = 0
    pontos: int = 100
    explicacao: str | None = None
    alternativas: list[AlternativaCreate] = []


class PerguntaRead(BaseModel):
    id: int
    quiz_id: int
    enunciado: str
    tipo: TipoPergunta
    ordem: int
    pontos: int
    explicacao: str | None = None
    alternativas: list[AlternativaRead] = []


class PerguntaAlunoRead(BaseModel):
    id: int
    enunciado: str
    tipo: TipoPergunta
    ordem: int
    pontos: int
    alternativas: list[AlternativaAlunoRead] = []


class QuizCreate(BaseModel):
    turma_id: int | None = None
    titulo: str
    descricao: str | None = None
    modo_execucao: ModoExecucaoQuiz = ModoExecucaoQuiz.individual
    competitivo: bool = False
    obrigatorio: bool = True
    meta_coletiva_percentual: int | None = None
    perguntas: list[PerguntaCreate] = []


class QuizRead(BaseModel):
    id: int
    professor_id: int | None = None
    turma_id: int | None = None
    titulo: str
    descricao: str | None = None
    modo_execucao: ModoExecucaoQuiz
    competitivo: bool
    obrigatorio: bool
    meta_coletiva_percentual: int | None = None
    created_at: datetime
    total_perguntas: int = 0


class QuizDetailRead(QuizRead):
    perguntas: list[PerguntaRead] = []


class GrupoInfo(BaseModel):
    id: int
    nome_ou_numero: str
    membros: list[str]


class PartidaIniciarRequest(BaseModel):
    quiz_id: int
    modo_execucao: ModoExecucaoQuiz | None = None
    competitivo: bool | None = None
    obrigatorio: bool | None = None
    meta_coletiva_percentual: int | None = None
    tempo_limite_segundos: int | None = None


class RespostaSubmitRequest(BaseModel):
    pergunta_id: int
    alternativa_id: int | None = None
    resposta_texto: str | None = None


class RespostaFeedback(BaseModel):
    pergunta_id: int
    salva: bool
    mensagem: str


class PartidaAlunoStatusRead(BaseModel):
    id: int
    aula_id: int
    quiz_titulo: str
    status: StatusPartida
    modo_execucao: ModoExecucaoQuiz
    competitivo: bool
    obrigatorio: bool
    meta_coletiva_percentual: int | None = None
    iniciada_em: datetime
    discussao_ate: datetime | None = None
    expira_em: datetime | None = None
    segundos_discussao_restantes: int = 0
    segundos_totais_restantes: int | None = None
    pode_enviar_resposta: bool = True
    pulou: bool = False
    grupo: GrupoInfo | None = None
    perguntas: list[PerguntaAlunoRead] = []
    respostas_enviadas: dict[int, int | None] = {}


class PartidaProfessorStatusRead(BaseModel):
    id: int
    aula_id: int
    quiz_id: int
    quiz_titulo: str
    status: StatusPartida
    modo_execucao: ModoExecucaoQuiz
    competitivo: bool
    obrigatorio: bool
    meta_coletiva_percentual: int | None = None
    iniciada_em: datetime
    discussao_ate: datetime | None = None
    expira_em: datetime | None = None
    total_participantes: int = 0
    total_respostas_esperadas: int = 0
    total_respostas_recebidas: int = 0
    total_acertos: int = 0
    percentual_acertos_atual: float = 0.0
    meta_atingida: bool = False
    grupos_count: int = 0


class RankingItem(BaseModel):
    posicao: int
    nome: str
    pontos: int
    acertos: int


class PartidaResultadoRead(BaseModel):
    partida_id: int
    status: StatusPartida
    modo_execucao: ModoExecucaoQuiz
    competitivo: bool
    pontuacao_individual: int = 0
    acertos_individual: int = 0
    total_perguntas: int = 0
    meta_coletiva_percentual: int | None = None
    percentual_turma: float = 0.0
    meta_coletiva_atingida: bool = False
    gabarito: list[PerguntaRead] = []
    ranking: list[RankingItem] | None = None


# ==========================================
# Métricas e Detalhes do Aluno
# ==========================================
class MetricasAlunoResponse(BaseModel):
    media_foco_segundos: float = 0.0
    media_atividade: float = 0.0  # 0 a 100
    total_foco_segundos: int = 0
    total_turmas: int = 0
    total_aulas_participadas: int = 0


class AulaAlunoDetalhe(BaseModel):
    id: int
    turma_id: int
    titulo: str
    codigo_aula: str
    status: StatusAula
    modo_atual: ModoAula
    created_at: datetime
    participou: bool = False
    score_foco_segundos: int = 0
    score_aprendizagem: int = 0


class TurmaAlunoDetalhesResponse(BaseModel):
    turma: TurmaRead
    media_foco_segundos: float = 0.0
    media_atividade: float = 0.0
    total_aulas: int = 0
    aulas_participadas: int = 0
    aulas: list[AulaAlunoDetalhe] = []


class HistoricoAulaItem(BaseModel):
    aula_id: int
    turma_id: int
    turma_nome: str
    aula_titulo: str
    codigo_aula: str
    status: StatusAula
    created_at: datetime
    score_foco_segundos: int = 0
    score_aprendizagem: int = 0


# Fase 2+: Schemas para Dashboard e Estatísticas do Professor
class AulaResumoProfessor(BaseModel):
    id: int
    turma_id: int
    turma_nome: str
    titulo: str
    codigo_aula: str
    status: StatusAula
    modo_atual: ModoAula
    created_at: datetime
    total_alunos_participantes: int = 0
    media_foco_segundos: float = 0.0
    media_atividade: float = 0.0


class MetricasProfessorResponse(BaseModel):
    total_turmas: int = 0
    total_aulas: int = 0
    total_alunos: int = 0
    media_foco_geral_segundos: float = 0.0
    media_atividades_geral: float = 0.0
    aulas_recentes: list[AulaResumoProfessor] = []


class AlunoDesempenhoTurma(BaseModel):
    id: int
    nome: str
    email: str
    matriculado_em: datetime
    total_aulas_participadas: int = 0
    media_foco_segundos: float = 0.0
    media_atividade: float = 0.0


class EstatisticasTurmaProfessorResponse(BaseModel):
    turma: TurmaRead
    total_alunos: int = 0
    total_aulas: int = 0
    media_foco_segundos: float = 0.0
    media_atividade: float = 0.0
    alunos: list[AlunoDesempenhoTurma] = []


