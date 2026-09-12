import type {
  ModoExecucaoQuiz,
  PartidaAlunoStatus,
  PartidaProfessorStatus,
  PartidaResultado,
  PerguntaCompleta,
  QuizResumo,
} from '../types/game'


const API_BASE = ''

export function getToken(): string | null {
  return localStorage.getItem('cp_token')
}

export function setToken(token: string, role: string) {
  localStorage.setItem('cp_token', token)
  localStorage.setItem('cp_role', role)
}

export function getRole(): string | null {
  return localStorage.getItem('cp_role')
}

export function clearAuth() {
  localStorage.removeItem('cp_token')
  localStorage.removeItem('cp_role')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  if (!res.ok) {
    let msg = `Erro ${res.status}`
    try {
      const errData = await res.json()
      if (errData.detail) msg = errData.detail
    } catch {
      // ignore
    }
    throw new Error(msg)
  }

  if (res.status === 204) {
    return {} as T
  }

  return res.json()
}

// Auth
export interface TokenResponse {
  access_token: string
  token_type: string
  tipo: 'professor' | 'aluno'
}

export async function loginProfessor(email: string, senha: string): Promise<TokenResponse> {
  return request<TokenResponse>('/professores/login', { method: 'POST', body: JSON.stringify({ email, senha }) })
}

export async function cadastrarProfessor(nome: string, email: string, senha: string): Promise<TokenResponse> {
  return request<TokenResponse>('/professores/cadastro', {
    method: 'POST',
    body: JSON.stringify({ nome, email, senha }),
  })
}

export async function loginAluno(email: string, senha: string): Promise<TokenResponse> {
  return request<TokenResponse>('/alunos/login', { method: 'POST', body: JSON.stringify({ email, senha }) })
}

export async function cadastrarAluno(nome: string, email: string, senha: string): Promise<TokenResponse> {
  return request<TokenResponse>('/alunos/cadastro', {
    method: 'POST',
    body: JSON.stringify({ nome, email, senha }),
  })
}

// Turmas
export interface Turma {
  id: number
  nome: string
  codigo_turma: string
  professor_id: number
  created_at: string
}

export async function criarTurma(nome: string): Promise<Turma> {
  return request<Turma>('/turmas', { method: 'POST', body: JSON.stringify({ nome }) })
}

export async function entrarTurma(codigo_turma: string): Promise<Turma> {
  return request<Turma>('/turmas/entrar', { method: 'POST', body: JSON.stringify({ codigo_turma }) })
}

export async function minhasTurmas(): Promise<Turma[]> {
  return request<Turma[]>('/turmas/minhas')
}

export async function turmasMatriculadas(): Promise<Turma[]> {
  return request<Turma[]>('/turmas/matriculadas')
}

// Aulas
export interface Aula {
  id: number
  turma_id: number
  titulo: string
  codigo_aula: string
  modo_atual: 'livre' | 'foco' | 'atividade'
  status: 'nao_iniciada' | 'em_andamento' | 'encerrada'
  created_at: string
}

export async function criarAula(turma_id: number, titulo: string): Promise<Aula> {
  return request<Aula>('/aulas', { method: 'POST', body: JSON.stringify({ turma_id, titulo }) })
}

export async function entrarAula(codigo_aula: string): Promise<Aula> {
  return request<Aula>('/aulas/entrar', { method: 'POST', body: JSON.stringify({ codigo_aula }) })
}

export async function listarAulasDaTurma(turmaId: number): Promise<Aula[]> {
  return request<Aula[]>(`/aulas/turma/${turmaId}`)
}

export async function obterAula(aulaId: number): Promise<Aula> {
  return request<Aula>(`/aulas/${aulaId}`)
}

export async function mudarModoAula(aulaId: number, modo: Aula['modo_atual']): Promise<Aula> {
  return request<Aula>(`/aulas/${aulaId}/modo`, { method: 'POST', body: JSON.stringify({ modo }) })
}

export async function encerrarAula(aulaId: number): Promise<Aula> {
  return request<Aula>(`/aulas/${aulaId}/encerrar`, { method: 'POST' })
}

export async function reportarFoco(aulaId: number, focoSegundos: number): Promise<void> {
  return request<void>(`/aulas/${aulaId}/foco`, {
    method: 'POST',
    body: JSON.stringify({ foco_segundos: focoSegundos }),
  })
}

// Quizzes (Professor)
export async function listarQuizzes(): Promise<QuizResumo[]> {
  return request<QuizResumo[]>('/quizzes/meus')
}

export async function criarQuiz(dados: {
  titulo: string
  descricao?: string
  modo_execucao: ModoExecucaoQuiz
  competitivo: boolean
  obrigatorio: boolean
  meta_coletiva_percentual?: number
  perguntas: PerguntaCompleta[]
}): Promise<QuizResumo> {
  return request<QuizResumo>('/quizzes', {
    method: 'POST',
    body: JSON.stringify(dados),
  })
}

export async function deletarQuiz(quizId: number): Promise<void> {
  return request<void>(`/quizzes/${quizId}`, { method: 'DELETE' })
}

// Partidas
export async function iniciarPartida(
  aulaId: number,
  dados: {
    quiz_id: number
    modo_execucao?: ModoExecucaoQuiz
    competitivo?: boolean
    obrigatorio?: boolean
    meta_coletiva_percentual?: number
    tempo_limite_segundos?: number
  }
): Promise<PartidaProfessorStatus> {
  return request<PartidaProfessorStatus>(`/partidas/aula/${aulaId}/iniciar`, {
    method: 'POST',
    body: JSON.stringify(dados),
  })
}

export async function obterStatusAluno(aulaId: number): Promise<PartidaAlunoStatus> {
  return request<PartidaAlunoStatus>(`/partidas/aula/${aulaId}/aluno-status`)
}

export async function responderPergunta(
  partidaId: number,
  perguntaId: number,
  alternativaId: number
): Promise<{ salva: boolean; mensagem: string }> {
  return request(`/partidas/${partidaId}/responder`, {
    method: 'POST',
    body: JSON.stringify({
      pergunta_id: perguntaId,
      alternativa_id: alternativaId,
    }),
  })
}

export async function pularPartida(partidaId: number): Promise<{ mensagem: string }> {
  return request(`/partidas/${partidaId}/pular`, {
    method: 'POST',
  })
}

export async function obterStatusProfessor(partidaId: number): Promise<PartidaProfessorStatus> {
  return request<PartidaProfessorStatus>(`/partidas/${partidaId}/professor-status`)
}

export async function obterPartidaAtiva(aulaId: number): Promise<PartidaProfessorStatus | null> {
  return request<PartidaProfessorStatus | null>(`/partidas/aula/${aulaId}/ativa`)
}

export async function encerrarPartida(partidaId: number): Promise<PartidaResultado> {
  return request<PartidaResultado>(`/partidas/${partidaId}/encerrar`, {
    method: 'POST',
  })
}

export async function obterResultados(partidaId: number): Promise<PartidaResultado> {
  return request<PartidaResultado>(`/partidas/${partidaId}/resultados`)
}

export function conectarWebSocketAula(aulaId: number, onMensagem: (data: any) => void): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws/aulas/${aulaId}`)
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      onMensagem(data)
    } catch {
      // ignore
    }
  }
  return ws
}
