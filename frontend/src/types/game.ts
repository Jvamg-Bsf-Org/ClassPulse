export type ModoExecucaoQuiz = 'individual' | 'grupo'
export type TipoPergunta = 'multipla_escolha' | 'verdadeiro_falso' | 'aberta'
export type StatusPartida = 'em_andamento' | 'encerrada'

export interface AlternativaAluno {
  id: number
  texto: string
}

export interface AlternativaCompleta {
  id?: number
  texto: string
  correta: boolean
}

export interface PerguntaAluno {
  id: number
  enunciado: string
  tipo: TipoPergunta
  ordem: number
  pontos: number
  alternativas: AlternativaAluno[]
}

export interface PerguntaCompleta {
  id?: number
  enunciado: string
  tipo: TipoPergunta
  ordem: number
  pontos: number
  explicacao?: string
  alternativas: AlternativaCompleta[]
}

export interface QuizResumo {
  id: number
  professor_id?: number
  turma_id?: number
  titulo: string
  descricao?: string
  modo_execucao: ModoExecucaoQuiz
  competitivo: boolean
  obrigatorio: boolean
  meta_coletiva_percentual?: number
  created_at: string
  total_perguntas: number
}

export interface GrupoInfo {
  id: number
  nome_ou_numero: string
  membros: string[]
}

export interface PartidaAlunoStatus {
  id: number
  aula_id: number
  quiz_titulo: string
  status: StatusPartida
  modo_execucao: ModoExecucaoQuiz
  competitivo: boolean
  obrigatorio: boolean
  meta_coletiva_percentual?: number
  iniciada_em: string
  discussao_ate?: string
  expira_em?: string
  segundos_discussao_restantes: number
  segundos_totais_restantes?: number
  pode_enviar_resposta: boolean
  pulou: boolean
  grupo?: GrupoInfo
  perguntas: PerguntaAluno[]
  respostas_enviadas: Record<number, number | null>
}

export interface PartidaProfessorStatus {
  id: number
  aula_id: number
  quiz_id: number
  quiz_titulo: string
  status: StatusPartida
  modo_execucao: ModoExecucaoQuiz
  competitivo: boolean
  obrigatorio: boolean
  meta_coletiva_percentual?: number
  iniciada_em: string
  discussao_ate?: string
  expira_em?: string
  total_participantes: number
  total_respostas_esperadas: number
  total_respostas_recebidas: number
  total_acertos: number
  percentual_acertos_atual: number
  meta_atingida: boolean
  grupos_count: number
}

export interface RankingItem {
  posicao: number
  nome: string
  pontos: number
  acertos: number
}

export interface PartidaResultado {
  partida_id: number
  status: StatusPartida
  modo_execucao: ModoExecucaoQuiz
  competitivo: boolean
  pontuacao_individual: number
  acertos_individual: number
  total_perguntas: number
  meta_coletiva_percentual?: number
  percentual_turma: number
  meta_coletiva_atingida: boolean
  gabarito: {
    id: number
    enunciado: string
    tipo: TipoPergunta
    pontos: number
    explicacao?: string
    alternativas: { id: number; texto: string; correta: boolean }[]
  }[]
  ranking?: RankingItem[]
}
