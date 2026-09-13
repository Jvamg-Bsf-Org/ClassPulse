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

/**
 * Só existe uma renovação de token por vez -- se várias chamadas tomam 401
 * juntas (ex: página fica minutos em background e várias requisições
 * disparam ao voltar), todas esperam a mesma promise em vez de bater no
 * /auth/refresh em paralelo.
 */
let renovacaoEmAndamento: Promise<boolean> | null = null

function tentarRenovarToken(): Promise<boolean> {
  if (!renovacaoEmAndamento) {
    renovacaoEmAndamento = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return false
        const data: TokenResponse = await res.json()
        setToken(data.access_token, data.tipo)
        return true
      })
      .catch(() => false)
      .finally(() => {
        renovacaoEmAndamento = null
      })
  }
  return renovacaoEmAndamento
}

async function request<T>(path: string, options: RequestInit = {}, jaTentouRenovar = false): Promise<T> {
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

  // Access token dura só 30min -- uma aula inteira facilmente passa disso.
  // Em vez de deslogar o aluno/professor no meio da aula, renova sozinho
  // usando o refresh token (cookie httponly) e repete a chamada original.
  if (res.status === 401 && !jaTentouRenovar) {
    const renovou = await tentarRenovarToken()
    if (renovou) {
      return request<T>(path, options, true)
    }
    clearAuth()
    window.dispatchEvent(new Event('classpulse:sessao-expirada'))
  }

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

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {})
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

export async function sairDaTurma(turmaId: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/turmas/${turmaId}/sair`, { method: 'POST' })
}

export async function excluirTurma(turmaId: number): Promise<void> {
  return request<void>(`/turmas/${turmaId}`, { method: 'DELETE' })
}

// Métricas e Detalhes do Aluno
export interface MetricasAluno {
  media_foco_segundos: number
  media_atividade: number
  total_foco_segundos: number
  total_turmas: number
  total_aulas_participadas: number
}

export interface AulaAlunoDetalhe {
  id: number
  turma_id: number
  titulo: string
  codigo_aula: string
  status: 'nao_iniciada' | 'em_andamento' | 'encerrada'
  modo_atual: 'livre' | 'foco' | 'atividade'
  created_at: string
  participou: boolean
  score_foco_segundos: number
  score_aprendizagem: number
}

export interface TurmaAlunoDetalhes {
  turma: Turma
  media_foco_segundos: number
  media_atividade: number
  total_aulas: number
  aulas_participadas: number
  aulas: AulaAlunoDetalhe[]
}

export interface HistoricoAulaItem {
  aula_id: number
  turma_id: number
  turma_nome: string
  aula_titulo: string
  codigo_aula: string
  status: 'nao_iniciada' | 'em_andamento' | 'encerrada'
  created_at: string
  score_foco_segundos: number
  score_aprendizagem: number
}

export async function obterMetricasAluno(): Promise<MetricasAluno> {
  return request<MetricasAluno>('/alunos/metricas')
}

export async function obterDetalhesTurmaAluno(turmaId: number): Promise<TurmaAlunoDetalhes> {
  return request<TurmaAlunoDetalhes>(`/alunos/turmas/${turmaId}/detalhes`)
}

export async function obterHistoricoAluno(): Promise<HistoricoAulaItem[]> {
  return request<HistoricoAulaItem[]>('/alunos/historico')
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
export async function listarQuizzes(turmaId?: number): Promise<QuizResumo[]> {
  const query = turmaId !== undefined ? `?turma_id=${turmaId}` : ''
  return request<QuizResumo[]>(`/quizzes/meus${query}`)
}

export async function listarQuizzesDaTurma(turmaId: number): Promise<QuizResumo[]> {
  return request<QuizResumo[]>(`/quizzes/turma/${turmaId}`)
}

export async function criarQuiz(dados: {
  turma_id?: number
  titulo: string
  descricao?: string
  modo_execucao?: ModoExecucaoQuiz
  competitivo?: boolean
  obrigatorio?: boolean
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

// Métricas e Estatísticas do Professor
export interface AulaResumoProfessor {
  id: number
  turma_id: number
  turma_nome: string
  titulo: string
  codigo_aula: string
  status: 'nao_iniciada' | 'em_andamento' | 'encerrada'
  modo_atual: 'livre' | 'foco' | 'atividade'
  created_at: string
  total_alunos_participantes: number
  media_foco_segundos: number
  media_atividade: number
}

export interface MetricasProfessor {
  total_turmas: number
  total_aulas: number
  total_alunos: number
  media_foco_geral_segundos: number
  media_atividades_geral: number
  aulas_recentes: AulaResumoProfessor[]
}

export interface AlunoDesempenhoTurma {
  id: number
  nome: string
  email: string
  matriculado_em: string
  total_aulas_participadas: number
  media_foco_segundos: number
  media_atividade: number
}

export interface EstatisticasTurmaProfessor {
  turma: Turma
  total_alunos: number
  total_aulas: number
  media_foco_segundos: number
  media_atividade: number
  alunos: AlunoDesempenhoTurma[]
}

export async function obterMetricasProfessor(): Promise<MetricasProfessor> {
  return request<MetricasProfessor>('/professores/metricas')
}

export async function obterEstatisticasTurmaProfessor(turmaId: number): Promise<EstatisticasTurmaProfessor> {
  return request<EstatisticasTurmaProfessor>(`/professores/turmas/${turmaId}/estatisticas`)
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

export interface ConexaoAula {
  close(): void
}

/**
 * Reconecta sozinho se a conexão cair (rede de escola, extensão do navegador
 * ou proxy que derruba WebSocket sem avisar) — sem isso, o aluno fica preso
 * numa tela desatualizada até dar refresh na página manualmente.
 */
export function conectarWebSocketAula(aulaId: number, onMensagem: (data: any) => void): ConexaoAula {
  let fechadoDeProposito = false
  let ws: WebSocket | null = null
  let tentativa = 0

  function conectar() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/aulas/${aulaId}`)

    ws.onmessage = (event) => {
      try {
        onMensagem(JSON.parse(event.data))
      } catch {
        // ignore
      }
    }

    ws.onopen = () => {
      tentativa = 0
    }

    ws.onclose = () => {
      if (fechadoDeProposito) return
      const espera = Math.min(1000 * 2 ** tentativa, 15000)
      tentativa += 1
      setTimeout(conectar, espera)
    }
  }

  conectar()

  return {
    close() {
      fechadoDeProposito = true
      ws?.close()
    },
  }
}
