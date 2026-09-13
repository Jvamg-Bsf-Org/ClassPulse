import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import StudentGameView from './StudentGameView'
import type { PartidaAlunoStatus } from '../types/game'

describe('StudentGameView Component Render', () => {
  it('renders student quiz activity with submit button', () => {
    const fakeStatus: PartidaAlunoStatus = {
      id: 1,
      aula_id: 10,
      quiz_titulo: 'Quiz de Cinemática',
      status: 'em_andamento',
      modo_execucao: 'individual',
      competitivo: false,
      obrigatorio: true,
      iniciada_em: '2026-09-12T21:00:00Z',
      pode_enviar_resposta: true,
      segundos_discussao_restantes: 0,
      segundos_totais_restantes: 180,
      pulou: false,
      perguntas: [
        {
          id: 101,
          ordem: 1,
          enunciado: 'Qual a fórmula da velocidade média?',
          tipo: 'multipla_escolha',
          pontos: 100,
          alternativas: [
            { id: 1, texto: 'v = delta S / delta t' },
            { id: 2, texto: 'v = m * a' },
          ],
        },
      ],
      respostas_enviadas: {},
      grupo: undefined,
    }

    const html = renderToString(
      <StudentGameView status={fakeStatus} onAtualizarStatus={() => {}} />
    )

    // Checks that question statement is rendered
    expect(html).toContain('Quiz de Cinemática')
    expect(html).toContain('Qual a fórmula da velocidade média?')
    expect(html).toContain('v = delta S / delta t')

    // Checks that the Submit button and section are rendered
    expect(html).toContain('Finalizar e Enviar Respostas')
    expect(html).toContain('Enviar Respostas')
  })
})
