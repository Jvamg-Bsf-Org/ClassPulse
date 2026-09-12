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
