import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import ProfessorApp from './ProfessorApp'
import TeacherResultsView from './TeacherResultsView'
import type { PartidaResultado } from '../types/game'

// Mock api methods
vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    obterMetricasProfessor: vi.fn().mockResolvedValue({
      total_turmas: 3,
      total_aulas: 8,
      total_alunos: 42,
      media_foco_geral_segundos: 250,
      media_atividades_geral: 88,
      aulas_recentes: [],
    }),
    minhasTurmas: vi.fn().mockResolvedValue([]),
    listarAulasDaTurma: vi.fn().mockResolvedValue([]),
    obterEstatisticasTurmaProfessor: vi.fn().mockResolvedValue(null),
    obterPartidaAtiva: vi.fn().mockResolvedValue(null),
  }
})

describe('ProfessorApp Component Render', () => {
  it('renders teacher dashboard with tabs and metrics', () => {
    const html = renderToString(<ProfessorApp />)
    expect(html).toContain('Visão Geral')
    expect(html).toContain('Minhas Turmas')
    expect(html).toContain('Visão Geral do Professor')
    expect(html).toContain('Média de Foco Geral')
    expect(html).toContain('Aproveitamento Médio')
  })
})

describe('TeacherResultsView Component Render', () => {
  it('renders class statistics without student 0 points error', () => {
    const fakeResultado: PartidaResultado = {
      partida_id: 1,
      status: 'encerrada',
      modo_execucao: 'individual',
      competitivo: false,
      meta_coletiva_atingida: true,
      percentual_turma: 85,
      meta_coletiva_percentual: 80,
      pontuacao_individual: 0, // In the past, this was shown to the teacher as their own score!
      acertos_individual: 0,
      total_perguntas: 3,
      gabarito: [
        {
          id: 1,
          enunciado: 'Qual a unidade de força?',
          tipo: 'multipla_escolha',
          pontos: 100,
          explicacao: 'Newton é a unidade padrão de força no SI.',
          alternativas: [
            { id: 10, texto: 'Newton', correta: true },
            { id: 11, texto: 'Joule', correta: false },
          ],
        },
      ],
      ranking: [
        { posicao: 1, nome: 'Alice', pontos: 100, acertos: 1 },
        { posicao: 2, nome: 'Bob', pontos: 80, acertos: 1 },
      ],
    }

    const html = renderToString(
      <TeacherResultsView resultado={fakeResultado} onVoltar={() => {}} />
    )

    // Should contain class stats
    expect(html).toContain('Estatísticas da Atividade da Turma')
    expect(html).toContain('Aproveitamento da Turma')
    expect(html).toContain('85%')
    expect(html).toContain('Meta Superada')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    expect(html).toContain('Gabarito e Justificativas Formativas')
    expect(html).toContain('Qual a unidade de força?')
    expect(html).toContain('Newton é a unidade padrão')

    // Must NOT contain personal 0 pts message!
    expect(html).not.toContain('Seu Desempenho no Jogo')
  })
})
