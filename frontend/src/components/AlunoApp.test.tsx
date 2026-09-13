import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import AlunoApp from './AlunoApp'

// Mock api methods to avoid network requests in SSR render test
vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    obterMetricasAluno: vi.fn().mockResolvedValue({
      media_foco_segundos: 120,
      media_atividade: 85,
      total_foco_segundos: 600,
      total_turmas: 2,
      total_aulas_participadas: 5,
    }),
    turmasMatriculadas: vi.fn().mockResolvedValue([]),
    obterDetalhesTurmaAluno: vi.fn().mockResolvedValue(null),
    sensoresSuportados: () => false,
  }
})

describe('AlunoApp Component Render', () => {
  it('renders student dashboard shell with tabs, showing a loading state before the mount fetch resolves', () => {
    // renderToString é síncrono e nunca espera o useEffect/fetch terminar --
    // por isso o esperado aqui é o estado de carregamento, não os dados.
    const html = renderToString(<AlunoApp />)
    expect(html).toContain('Visão Geral')
    expect(html).toContain('Minhas Turmas')
    expect(html).toContain('Visão Geral do Aluno')
    expect(html).toContain('Carregando seu painel...')
    expect(html).not.toContain('Média de Foco')
  })
})
