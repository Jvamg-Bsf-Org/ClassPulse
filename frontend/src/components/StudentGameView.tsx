import { useEffect, useState } from 'react'
import type { PartidaAlunoStatus, PartidaResultado } from '../types/game'

import { obterResultados, pularPartida, responderPergunta } from '../services/api'
import ResultsView from './ResultsView'

interface Props {
  status: PartidaAlunoStatus
  onAtualizarStatus: () => void
}

export default function StudentGameView({ status, onAtualizarStatus }: Props) {
  const [discussaoSegundos, setDiscussaoSegundos] = useState(
    status.segundos_discussao_restantes || 0
  )
  const [totaisSegundos, setTotaisSegundos] = useState<number | null>(
    status.segundos_totais_restantes ?? null
  )
  const [respostas, setRespostas] = useState<Record<number, number | null>>(
    status.respostas_enviadas || {}
  )
  const [enviando, setEnviando] = useState<number | null>(null)
  const [pulou, setPulou] = useState(status.pulou)
  const [resultadoFinal, setResultadoFinal] = useState<PartidaResultado | null>(null)
  const [carregandoResultado, setCarregandoResultado] = useState(false)

  // Timer de discussão dos 60 segundos
  useEffect(() => {
    if (discussaoSegundos <= 0) return
    const interval = setInterval(() => {
      setDiscussaoSegundos((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [discussaoSegundos])

  // Timer total da partida
  useEffect(() => {
    if (totaisSegundos === null || totaisSegundos <= 0) return
    const interval = setInterval(() => {
      setTotaisSegundos((prev) => (prev && prev > 1 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [totaisSegundos])

  // Sincronizar respostas do prop
  useEffect(() => {
    setRespostas(status.respostas_enviadas || {})
    setDiscussaoSegundos(status.segundos_discussao_restantes || 0)
    setTotaisSegundos(status.segundos_totais_restantes ?? null)
    setPulou(status.pulou)
  }, [status])

  const podeResponder = discussaoSegundos === 0 && (totaisSegundos === null || totaisSegundos > 0)

  async function handleSelecionarAlternativa(perguntaId: number, alternativaId: number) {
    if (!podeResponder || enviando !== null) return
    setEnviando(perguntaId)
    // Atualização otimista
    setRespostas((prev) => ({ ...prev, [perguntaId]: alternativaId }))

    try {
      await responderPergunta(status.id, perguntaId, alternativaId)
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`)
      onAtualizarStatus()
    } finally {
      setEnviando(null)
    }
  }

  async function handlePular() {
    if (!confirm('Deseja realmente não participar desta atividade? Seu Score de Foco será mantido.')) {
      return
    }
    try {
      await pularPartida(status.id)
      setPulou(true)
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function handleVerResultados() {
    setCarregandoResultado(true)
    try {
      const res = await obterResultados(status.id)
      setResultadoFinal(res)
    } catch {
      alert('Resultados ainda não consolidados pelo professor.')
    } finally {

      setCarregandoResultado(false)
    }
  }

  if (resultadoFinal) {
    return <ResultsView resultado={resultadoFinal} onVoltar={() => setResultadoFinal(null)} />
  }

  if (pulou) {
    return (
      <div className="game-card student-card pulse-fade-in">
        <div className="status-badge badge-neutral">Atividade Opcional Dispensada</div>
        <div className="icon-large">🛡️</div>
        <h2>Você optou por não participar</h2>
        <p className="subtitle">
          Seu <strong>Score de Foco</strong> da Fase 1 continua 100% preservado e protegido.
        </p>
        <p className="text-muted">Aguarde o professor avançar para a próxima etapa da aula.</p>
      </div>
    )
  }

  return (
    <div className="student-container pulse-fade-in">
      {/* Header do Jogo */}
      <div className="student-header">
        <div className="header-top">
          <span className="badge-tag">FASE 2 • ATIVIDADE</span>
          {!status.obrigatorio && (
            <button className="btn-skip" onClick={handlePular}>
              Pular Atividade
            </button>
          )}
        </div>

        <h1 className="quiz-title">{status.quiz_titulo}</h1>

        <div className="badges-row">
          <span className={`pill-badge ${status.modo_execucao === 'grupo' ? 'pill-purple' : 'pill-blue'}`}>
            {status.modo_execucao === 'grupo' ? '👥 Em Equipe' : '👤 Individual'}
          </span>
          <span className={`pill-badge ${status.competitivo ? 'pill-amber' : 'pill-green'}`}>
            {status.competitivo ? '🏆 Competitivo' : `🤝 Cooperativo (${status.meta_coletiva_percentual || 80}% meta)`}
          </span>
          {totaisSegundos !== null && (
            <span className="pill-badge pill-time">
              ⏱️ {Math.floor(totaisSegundos / 60)}:{(totaisSegundos % 60).toString().padStart(2, '0')}
            </span>
          )}
        </div>
      </div>

      {/* Banner de Equipe e Discussão (Se Grupo) */}
      {status.modo_execucao === 'grupo' && status.grupo && (
        <div className="group-banner">
          <div className="group-info">
            <span className="group-name">{status.grupo.nome_ou_numero}</span>
            <span className="group-members">
              Integrantes: <strong>{status.grupo.membros.join(', ')}</strong>
            </span>
          </div>

          {discussaoSegundos > 0 ? (
            <div className="discussion-box active">
              <div className="countdown-ring">
                <span className="seconds-num">{discussaoSegundos}s</span>
              </div>
              <div className="discussion-text">
                <strong>Debata com seu colega presencialmente!</strong>
                <p>O envio de respostas será desbloqueado ao fim da contagem.</p>
              </div>
            </div>
          ) : (
            <div className="discussion-box unlocked">
              <span className="check-icon">✓</span>
              <span>Debate concluído! Qualquer membro pode enviar a resposta da equipe.</span>
            </div>
          )}
        </div>
      )}

      {/* Lista de Perguntas em Lote */}
      <div className="questions-container">
        {status.perguntas.map((pergunta, idx) => {
          const selecionada = respostas[pergunta.id]
          return (
            <div key={pergunta.id} className="question-block">
              <div className="question-header">
                <span className="q-number">Questão {idx + 1} de {status.perguntas.length}</span>
                <span className="q-points">{pergunta.pontos} pts</span>
              </div>

              <p className="q-statement">{pergunta.enunciado}</p>

              <div className="options-grid">
                {pergunta.alternativas.map((alt) => {
                  const isChecked = selecionada === alt.id
                  return (
                    <button
                      key={alt.id}
                      type="button"
                      disabled={!podeResponder}
                      className={`option-btn ${isChecked ? 'selected' : ''} ${!podeResponder ? 'disabled' : ''}`}
                      onClick={() => handleSelecionarAlternativa(pergunta.id, alt.id)}
                    >
                      <span className="opt-radio">{isChecked ? '●' : '○'}</span>
                      <span className="opt-text">{alt.texto}</span>
                      {isChecked && <span className="opt-saved">✓ Salva</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer com status de conclusão */}
      <div className="student-footer">
        <div className="completion-status">
          <span>
            {Object.keys(respostas).length} de {status.perguntas.length} respondidas
          </span>
          <div className="mini-progress-bar">
            <div
              className="mini-fill"
              style={{
                width: `${status.perguntas.length ? (Object.keys(respostas).length / status.perguntas.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        <button
          className="btn-refresh"
          onClick={onAtualizarStatus}
          title="Sincronizar respostas do grupo"
        >
          🔄 Atualizar
        </button>

        <button
          className="btn-results"
          onClick={handleVerResultados}
          disabled={carregandoResultado}
        >
          {carregandoResultado ? 'Carregando...' : 'Ver Gabarito & Resultados'}
        </button>
      </div>
    </div>
  )
}
