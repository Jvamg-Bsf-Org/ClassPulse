import { useEffect, useState } from 'react'
import type {
  ModoExecucaoQuiz,
  PartidaProfessorStatus,
  PartidaResultado,
  QuizResumo,
} from '../types/game'

import {
  encerrarPartida,
  iniciarPartida,
  listarQuizzes,
  obterStatusProfessor,
} from '../services/api'
import TeacherResultsView from './TeacherResultsView'

interface Props {
  aulaId: number
  turmaId?: number
  activePartidaId?: number | null
  onPartidaCriada?: (partidaId: number) => void
}

export default function TeacherGameDashboard({
  aulaId,
  turmaId,
  activePartidaId,
  onPartidaCriada,
}: Props) {
  const [quizzes, setQuizzes] = useState<QuizResumo[]>([])
  const [carregandoQuizzes, setCarregandoQuizzes] = useState(true)
  const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null)
  const [partidaStatus, setPartidaStatus] = useState<PartidaProfessorStatus | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [iniciando, setIniciando] = useState(false)
  const [resultadoFinal, setResultadoFinal] = useState<PartidaResultado | null>(null)

  // Customizações para o disparo
  const [modoExecucao, setModoExecucao] = useState<ModoExecucaoQuiz>('individual')
  const [competitivo, setCompetitivo] = useState(false)
  const [obrigatorio, setObrigatorio] = useState(true)
  const [metaColetiva, setMetaColetiva] = useState(80)
  const [tempoMinutos, setTempoMinutos] = useState(5)

  // Carregar lista de quizzes (filtrada por turma se fornecida)
  useEffect(() => {
    setCarregandoQuizzes(true)
    listarQuizzes(turmaId)
      .then((data) => {
        setQuizzes(data)
        if (data.length > 0) {
          setSelectedQuizId((prev) => prev ?? data[0].id)
        }
      })
      .finally(() => setCarregandoQuizzes(false))
  }, [])


  // Atualizar status da partida ativa
  async function atualizarStatus() {
    if (!activePartidaId) return
    try {
      const data = await obterStatusProfessor(activePartidaId)
      setPartidaStatus(data)
    } catch {
      // partida pode ter encerrado
    }
  }

  useEffect(() => {
    if (activePartidaId) {
      atualizarStatus()
      const interval = setInterval(atualizarStatus, 3000)
      return () => clearInterval(interval)
    } else {
      setPartidaStatus(null)
    }
  }, [activePartidaId])

  async function handleDisparar(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedQuizId) {
      alert('Selecione um quiz para disparar')
      return
    }

    setIniciando(true)
    try {
      const nova = await iniciarPartida(aulaId, {
        quiz_id: selectedQuizId,
        modo_execucao: modoExecucao,
        competitivo,
        obrigatorio,
        meta_coletiva_percentual: competitivo ? undefined : metaColetiva,
        tempo_limite_segundos: tempoMinutos > 0 ? tempoMinutos * 60 : undefined,
      })
      setPartidaStatus(nova)
      if (onPartidaCriada) onPartidaCriada(nova.id)
      alert('Atividade disparada com sucesso nos celulares dos alunos!')
    } catch (err: any) {
      alert(`Erro: ${err.message}`)
    } finally {
      setIniciando(false)
    }
  }

  async function handleEncerrar() {
    if (!partidaStatus) return
    if (!confirm('Deseja encerrar a atividade agora e liberar os resultados para a turma?')) {
      return
    }

    setCarregando(true)
    try {
      const res = await encerrarPartida(partidaStatus.id)
      setResultadoFinal(res)
      setPartidaStatus(null)
    } catch (err: any) {
      alert(`Erro ao encerrar: ${err.message}`)
    } finally {
      setCarregando(false)
    }
  }

  if (resultadoFinal) {
    return <TeacherResultsView resultado={resultadoFinal} onVoltar={() => setResultadoFinal(null)} />
  }

  return (
    <div className="teacher-game-dashboard pulse-fade-in">
      {/* Se há uma partida em andamento */}
      {partidaStatus && partidaStatus.status === 'em_andamento' ? (
        <div className="live-monitor-card">
          <div className="live-header">
            <div>
              <span className="live-badge">● AO VIVO NA SALA</span>
              <h2>{partidaStatus.quiz_titulo}</h2>
            </div>
            <button
              className="btn-end-game"
              onClick={handleEncerrar}
              disabled={carregando}
            >
              {carregando ? 'Encerrando...' : 'Encerrar Atividade e Liberar Notas'}
            </button>
          </div>

          <div className="metrics-grid">
            <div className="metric-box">
              <span className="metric-num">{partidaStatus.total_participantes}</span>
              <span className="metric-label">Alunos Conectados</span>
            </div>

            <div className="metric-box">
              <span className="metric-num">
                {partidaStatus.total_respostas_recebidas} / {partidaStatus.total_respostas_esperadas}
              </span>
              <span className="metric-label">Respostas Recebidas</span>
            </div>

            <div className="metric-box">
              <span className="metric-num">{partidaStatus.total_acertos}</span>
              <span className="metric-label">Total de Acertos</span>
            </div>

            <div className="metric-box">
              <span className="metric-num">{partidaStatus.percentual_acertos_atual}%</span>
              <span className="metric-label">Taxa de Acerto da Sala</span>
            </div>
          </div>

          {/* Barra Coletiva se Cooperativo */}
          {!partidaStatus.competitivo && (
            <div className="coop-progress-section">
              <div className="coop-progress-labels">
                <span>🤝 Progresso Coletivo da Sala</span>
                <span>
                  <strong>{partidaStatus.percentual_acertos_atual}%</strong> / Meta: {partidaStatus.meta_coletiva_percentual || 80}%
                </span>
              </div>
              <div className="coop-progress-track">
                <div
                  className={`coop-progress-fill ${partidaStatus.meta_atingida ? 'goal-reached' : ''}`}
                  style={{ width: `${Math.min(100, partidaStatus.percentual_acertos_atual)}%` }}
                />
              </div>
              {partidaStatus.meta_atingida && (
                <div className="goal-banner-inline">
                  🎉 A turma superou a meta coletiva! A conquista será liberada no encerramento.
                </div>
              )}
            </div>
          )}

          {/* Detalhes de Modo */}
          <div className="mode-details-footer">
            <span>
              Modo: <strong>{partidaStatus.modo_execucao === 'grupo' ? `Equipes (${partidaStatus.grupos_count} geradas)` : 'Individual'}</strong>
            </span>
            <span>
              Critério: <strong>{partidaStatus.competitivo ? 'Ranking de Pontos' : 'Meta Coletiva Anti-Ansiedade'}</strong>
            </span>
            <span>
              Participação: <strong>{partidaStatus.obrigatorio ? 'Obrigatória' : 'Opcional'}</strong>
            </span>
          </div>
        </div>
      ) : (
        /* Painel de Lançamento de Atividade */
        <div className="launch-card">
          <div className="launch-header">
            <h2>Disparar Atividade Gamificada</h2>
            <p className="subtitle">
              Pausa a explicação teórica e envia o desafio diretamente para a tela dos smartphones dos alunos.
            </p>
          </div>

          {carregandoQuizzes ? (
            <div className="loading-state">Carregando seus quizzes...</div>
          ) : quizzes.length === 0 ? (
            <div className="alert-notice">
              ⚠️ Nenhum quiz cadastrado no seu banco de questões. Crie um quiz na aba "Banco de Quizzes" antes de disparar.
            </div>
          ) : (
            <form onSubmit={handleDisparar} className="launch-form">
              <div className="form-group">
                <label htmlFor="dash-quiz">Selecione o Quiz para esta rodada:</label>
                <select
                  id="dash-quiz"
                  value={selectedQuizId || ''}
                  onChange={(e) => setSelectedQuizId(Number(e.target.value))}
                  required
                >
                  {quizzes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.titulo} ({q.total_perguntas} questões)
                    </option>
                  ))}
                </select>
              </div>

              <div className="toggles-grid">
                <div className="toggle-box">
                  <label htmlFor="dash-agrupamento">Agrupamento:</label>
                  <select
                    id="dash-agrupamento"
                    value={modoExecucao}
                    onChange={(e) => setModoExecucao(e.target.value as ModoExecucaoQuiz)}
                  >
                    <option value="individual">👤 Individual</option>
                    <option value="grupo">👥 Equipes / Duplas (com 60s de debate)</option>
                  </select>
                </div>

                <div className="toggle-box">
                  <label htmlFor="dash-dinamica">Dinâmica:</label>
                  <select
                    id="dash-dinamica"
                    value={competitivo ? 'comp' : 'coop'}
                    onChange={(e) => setCompetitivo(e.target.value === 'comp')}
                  >
                    <option value="coop">🤝 Cooperativo (Meta da Turma)</option>
                    <option value="comp">🏆 Competitivo (Placar/Ranking)</option>
                  </select>
                </div>

                {!competitivo && (
                  <div className="toggle-box">
                    <label htmlFor="dash-meta">Meta de Acertos da Turma:</label>
                    <input
                      id="dash-meta"
                      type="number"
                      min="20"
                      max="100"
                      value={metaColetiva}
                      onChange={(e) => setMetaColetiva(Number(e.target.value))}
                    />
                  </div>
                )}

                <div className="toggle-box">
                  <label htmlFor="dash-carater">Caráter da Atividade:</label>
                  <select
                    id="dash-carater"
                    value={obrigatorio ? 'obrig' : 'opc'}
                    onChange={(e) => setObrigatorio(e.target.value === 'obrig')}
                  >
                    <option value="obrig">Obrigatória</option>
                    <option value="opc">Opcional (aluno pode pular)</option>
                  </select>
                </div>

                <div className="toggle-box">
                  <label htmlFor="dash-tempo">Tempo Limite (minutos):</label>
                  <input
                    id="dash-tempo"
                    type="number"
                    min="1"
                    max="60"
                    value={tempoMinutos}
                    onChange={(e) => setTempoMinutos(Number(e.target.value))}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-launch-primary"
                disabled={iniciando || !selectedQuizId}
              >
                {iniciando ? 'Disparando...' : '🚀 Disparar Atividade nos Celulares'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
