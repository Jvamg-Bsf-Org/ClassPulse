import { useEffect, useRef, useState } from 'react'
import {
  conectarWebSocketAula,
  entrarAula,
  entrarTurma,
  obterDetalhesTurmaAluno,
  obterHistoricoAluno,
  obterMetricasAluno,
  obterStatusAluno,
  reportarFoco,
  sairDaTurma,
  turmasMatriculadas,
  type Aula,
  type HistoricoAulaItem,
  type MetricasAluno,
  type Turma,
  type TurmaAlunoDetalhes,
} from '../services/api'
import type { PartidaAlunoStatus } from '../types/game'
import { FocusSession, type ResumoFocoSessao } from '../focus/focusSession'
import { iniciarSessaoDeFoco, sensoresSuportados, solicitarPermissaoSensores, type SessaoAtiva } from '../focus/sensors'
import StudentGameView from './StudentGameView'

type AbaAluno = 'geral' | 'turmas' | 'historico'

function formatarTempo(segundos: number): string {
  if (!segundos || segundos <= 0) return '0s'
  const min = Math.floor(segundos / 60)
  const seg = Math.round(segundos % 60)
  if (min === 0) return `${seg}s`
  if (seg === 0) return `${min}min`
  return `${min}m ${seg}s`
}

export default function AlunoApp() {
  // Navegação principal
  const [aba, setAba] = useState<AbaAluno>('geral')
  const [aula, setAula] = useState<Aula | null>(null)

  // Dados do dashboard e turmas
  const [metricas, setMetricas] = useState<MetricasAluno | null>(null)
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [turmaSelecionada, setTurmaSelecionada] = useState<Turma | null>(null)
  const [detalhesTurma, setDetalhesTurma] = useState<TurmaAlunoDetalhes | null>(null)
  const [historico, setHistorico] = useState<HistoricoAulaItem[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)

  // Formulários e entradas
  const [codigoTurma, setCodigoTurma] = useState('')
  const [codigoAula, setCodigoAula] = useState('')
  const [mostrandoFormTurma, setMostrandoFormTurma] = useState(false)
  const [mostrandoFormAula, setMostrandoFormAula] = useState(false)

  // Estados de feedback
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  // Sensores, foco e jogos (para aula ativa)
  const [permissaoSensor, setPermissaoSensor] = useState<'nao_pedida' | 'concedida' | 'negada'>('nao_pedida')
  const [resumoFoco, setResumoFoco] = useState<ResumoFocoSessao | null>(null)
  const [partida, setPartida] = useState<PartidaAlunoStatus | null>(null)

  const sessaoRef = useRef<SessaoAtiva | null>(null)
  const focusSessionRef = useRef<FocusSession | null>(null)

  // Carregar dados gerais ao iniciar
  useEffect(() => {
    carregarDadosGerais()
  }, [])

  // Carregar detalhes ao selecionar uma turma
  useEffect(() => {
    if (!turmaSelecionada) {
      setDetalhesTurma(null)
      return
    }
    carregarDetalhesDaTurma(turmaSelecionada.id)
  }, [turmaSelecionada])

  async function carregarDadosGerais() {
    setCarregando(true)
    try {
      const [m, t] = await Promise.all([obterMetricasAluno(), turmasMatriculadas()])
      setMetricas(m)
      setTurmas(t)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar seus dados.')
    } finally {
      setCarregando(false)
    }
  }

  async function carregarDetalhesDaTurma(turmaId: number) {
    setCarregando(true)
    try {
      const d = await obterDetalhesTurmaAluno(turmaId)
      setDetalhesTurma(d)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar detalhes da turma.')
    } finally {
      setCarregando(false)
    }
  }

  async function carregarHistorico() {
    setCarregandoHistorico(true)
    try {
      const h = await obterHistoricoAluno()
      setHistorico(h)
    } catch (e) {
      console.error(e)
    } finally {
      setCarregandoHistorico(false)
    }
  }

  async function handleSairTurma(turmaId: number, turmaNome: string) {
    if (!confirm(`Deseja realmente sair da turma "${turmaNome}"? Suas notas de aulas continuarão no seu histórico, mas você não verá mais esta turma.`)) {
      return
    }
    setCarregando(true)
    setErro(null)
    setSucesso(null)
    try {
      await sairDaTurma(turmaId)
      setSucesso(`Você saiu da turma "${turmaNome}" com sucesso.`)
      setTurmaSelecionada(null)
      await carregarDadosGerais()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível sair da turma.')
    } finally {
      setCarregando(false)
    }
  }

  // Ações de turma e aula
  async function handleEntrarTurma(e: React.FormEvent) {
    e.preventDefault()
    if (!codigoTurma.trim()) return
    setErro(null)
    setSucesso(null)
    setCarregando(true)
    try {
      const novaTurma = await entrarTurma(codigoTurma.trim())
      setCodigoTurma('')
      setMostrandoFormTurma(false)
      setSucesso(`Matrícula realizada na turma "${novaTurma.nome}" com sucesso!`)
      await carregarDadosGerais()
      setTurmaSelecionada(novaTurma)
      setAba('turmas')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Código de turma inválido.')
    } finally {
      setCarregando(false)
    }
  }

  async function handleEntrarAulaPorCodigo(codigo: string) {
    setErro(null)
    setSucesso(null)
    setCarregando(true)
    try {
      const a = await entrarAula(codigo.trim())
      setAula(a)
      setCodigoAula('')
      setMostrandoFormAula(false)
      if (a.modo_atual === 'foco') iniciarFoco()
      if (a.modo_atual === 'atividade') carregarPartida(a.id)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Código de aula inválido ou não autorizado.')
    } finally {
      setCarregando(false)
    }
  }

  // Controle de foco e sensores
  function pararSessaoDeFoco() {
    sessaoRef.current?.parar()
    sessaoRef.current = null
    focusSessionRef.current = null
    setResumoFoco(null)
  }

  function iniciarFoco() {
    pararSessaoDeFoco()
    const ativa = iniciarSessaoDeFoco({ sensoresDisponiveis: permissaoSensor === 'concedida' })
    sessaoRef.current = ativa
    focusSessionRef.current = ativa.sessao
  }

  async function carregarPartida(aulaId: number) {
    try {
      setPartida(await obterStatusAluno(aulaId))
    } catch {
      setPartida(null)
    }
  }

  async function handleAtivarSensores() {
    const ok = await solicitarPermissaoSensores()
    setPermissaoSensor(ok ? 'concedida' : 'negada')
  }

  function handleSairDaAula() {
    pararSessaoDeFoco()
    setAula(null)
    setPartida(null)
    carregarDadosGerais()
    if (turmaSelecionada) {
      carregarDetalhesDaTurma(turmaSelecionada.id)
    }
  }

  // WebSocket da aula ativa
  useEffect(() => {
    if (!aula) return

    const ws = conectarWebSocketAula(aula.id, (msg) => {
      if (msg.evento === 'modo_mudou') {
        setAula((prev) => (prev ? { ...prev, modo_atual: msg.modo } : prev))
        setPartida(null)
        if (msg.modo === 'foco') {
          iniciarFoco()
        } else {
          pararSessaoDeFoco()
        }
      }
      if (msg.evento === 'partida_iniciada') {
        pararSessaoDeFoco()
        setAula((prev) => (prev ? { ...prev, modo_atual: 'atividade' } : prev))
        carregarPartida(aula.id)
      }
      if (msg.evento === 'resposta_registrada') {
        carregarPartida(aula.id)
      }
      if (msg.evento === 'aula_encerrada') {
        pararSessaoDeFoco()
      }
    })

    return () => {
      ws.close()
      pararSessaoDeFoco()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aula?.id])

  // Relatório contínuo de foco
  useEffect(() => {
    if (!aula) return
    const aulaId = aula.id
    const intervalo = setInterval(() => {
      const sessao = focusSessionRef.current
      if (!sessao) return
      const r = sessao.resumo()
      setResumoFoco(r)
      reportarFoco(aulaId, r.focoSegundos).catch(() => {})
    }, 4000)
    return () => clearInterval(intervalo)
  }, [aula])


  // ==========================================
  // RENDERIZAÇÃO: Aula Ao Vivo
  // ==========================================
  if (aula) {
    return (
      <div className="live-aula-container">
        <div className="live-aula-topbar">
          <button className="btn-voltar-aula" onClick={handleSairDaAula}>
            ← Voltar para Minhas Turmas
          </button>
          <div className="aula-meta-badge">
            <span className="pulsing-dot" />
            <span>Aula: {aula.titulo}</span>
            <span className="codigo-pill">#{aula.codigo_aula}</span>
          </div>
        </div>

        <div className="sensor-action-bar">
          <span className="sensor-label">
            Sensores de movimento: {sensoresSuportados() ? permissaoSensor : 'indisponível'}
          </span>
          {sensoresSuportados() && permissaoSensor !== 'concedida' && (
            <button className="btn-sensor-activate" onClick={handleAtivarSensores}>
              Ativar Sensores
            </button>
          )}
        </div>

        {partida ? (
          <StudentGameView status={partida} onAtualizarStatus={() => carregarPartida(aula.id)} />
        ) : aula.modo_atual === 'livre' ? (
          <div className="waiting-card">
            <h2>Aula em andamento</h2>
            <p>O professor está conduzindo a aula. Fique atento às instruções!</p>
          </div>
        ) : aula.modo_atual === 'foco' ? (
          <div className="waiting-card">
            <div className="foco-banner">
              📱 Modo Foco Ativo! Vire seu celular com a tela para baixo ou deixe-o imóvel.
            </div>
            {resumoFoco && (
              <ul className="foco-status-list">
                <li>Estado: <strong>{resumoFoco.estadoAtual}</strong></li>
                <li>Foco acumulado: <strong>{formatarTempo(resumoFoco.focoSegundos)}</strong></li>
                <li>Distração: <strong>{formatarTempo(resumoFoco.distracaoSegundos)}</strong></li>
              </ul>
            )}
          </div>
        ) : (
          <div className="waiting-card">
            <p>Carregando atividade...</p>
          </div>
        )}
      </div>
    )
  }

  // ==========================================
  // RENDERIZAÇÃO: Dashboard do Aluno
  // ==========================================
  return (
    <div className="student-dashboard">
      {/* Mensagens Globais de Erro e Sucesso */}
      {erro && (
        <div className="alert-banner error-banner">
          <span>{erro}</span>
          <button type="button" className="btn-close-alert" onClick={() => setErro(null)} title="Fechar">✕</button>
        </div>
      )}
      {sucesso && (
        <div className="alert-banner success-banner">
          <span>{sucesso}</span>
          <button type="button" className="btn-close-alert" onClick={() => setSucesso(null)} title="Fechar">✕</button>
        </div>
      )}


      {/* ==================================================== */}
      {/* ABA 1: VISÃO GERAL (DASHBOARD COM MÉDIAS GERAIS)    */}
      {/* ==================================================== */}
      {aba === 'geral' && (
        <div className="tab-content fade-in">
          <div className="overview-header">
            <div>
              <h2>Visão Geral do Aluno</h2>
              <p className="subtitle-text">Acompanhe suas médias consolidadas de foco e atividades interativas.</p>
            </div>
          </div>

          {/* Grid de Métricas Principais */}
          <div className="metrics-grid">
            <div className="metric-card focus-card">
              <div className="metric-header">
                <span className="metric-title">Média de Foco</span>
                <span className="metric-badge-icon">⏱️</span>
              </div>
              <div className="metric-value">
                {metricas ? formatarTempo(metricas.media_foco_segundos) : '--'}
              </div>
              <p className="metric-subtext">
                Tempo total de foco acumulado:{' '}
                <strong>{metricas ? formatarTempo(metricas.total_foco_segundos) : '0s'}</strong>
              </p>
            </div>

            <div className="metric-card activity-card">
              <div className="metric-header">
                <span className="metric-title">Média de Atividades</span>
                <span className="metric-badge-icon">🎯</span>
              </div>
              <div className="metric-value">
                {metricas ? `${metricas.media_atividade}%` : '--'}
              </div>
              <div className="metric-progress-bar">
                <div
                  className="metric-progress-fill"
                  style={{ width: `${Math.min(metricas?.media_atividade || 0, 100)}%` }}
                />
              </div>
              <p className="metric-subtext">Aproveitamento médio em quizzes e desafios</p>
            </div>

            <div
              className="metric-card stat-card metric-clickable"
              onClick={() => {
                setAba('turmas')
                setTurmaSelecionada(null)
              }}
              title="Acessar Minhas Turmas"
            >
              <div className="metric-header">
                <span className="metric-title">Turmas</span>
                <span className="metric-badge-icon">📚</span>
              </div>
              <div className="metric-value">{metricas ? metricas.total_turmas : 0}</div>
              <p className="metric-subtext">Turmas em que você está matriculado →</p>
            </div>

            <div
              className="metric-card stat-card metric-clickable"
              onClick={() => {
                setAba('historico')
                carregarHistorico()
              }}
              title="Ver Histórico de Aulas Concluídas"
            >
              <div className="metric-header">
                <span className="metric-title">Aulas Concluídas</span>
                <span className="metric-badge-icon">📝</span>
              </div>
              <div className="metric-value">
                {metricas ? metricas.total_aulas_participadas : 0}
              </div>
              <p className="metric-subtext">Ver histórico de aulas assistidas →</p>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* ABA OCULTA: HISTÓRICO DE AULAS CONCLUÍDAS           */}
      {/* ==================================================== */}
      {aba === 'historico' && (
        <div className="tab-content fade-in">
          <div className="history-header">
            <button className="btn-back-pill" onClick={() => setAba('geral')}>
              ← Voltar à Visão Geral
            </button>
            <div>
              <h2>📝 Histórico de Aulas Concluídas</h2>
              <p className="subtitle-text">
                Consulte todas as aulas em que você esteve presente com seus respectivos scores de foco e atividades.
              </p>
            </div>
          </div>

          {carregandoHistorico ? (
            <div className="loading-state" style={{ padding: '3rem', textAlign: 'center' }}>
              Carregando histórico de aulas...
            </div>
          ) : historico.length === 0 ? (
            <div className="empty-turmas-card fade-in" style={{ marginTop: '1.5rem' }}>
              <div className="empty-turmas-icon">📂</div>
              <h3>Nenhuma aula concluída registrada ainda</h3>
              <p>
                Ao participar das aulas ao vivo e sessões de foco em suas turmas, elas serão arquivadas aqui.
              </p>
              <button className="btn-primary" onClick={() => setAba('turmas')}>
                Acessar Minhas Turmas
              </button>
            </div>
          ) : (
            <div className="history-list-grid" style={{ marginTop: '1.5rem' }}>
              {historico.map((item) => (
                <div key={item.aula_id} className="history-card-item">
                  <div className="history-item-top">
                    <span className="history-turma-badge">{item.turma_nome}</span>
                    <span className="history-date">
                      {new Date(item.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <h3 className="history-title">{item.aula_titulo}</h3>
                  <div className="history-metrics-row">
                    <div className="score-badge focus-badge">
                      <span className="score-icon">⏱️</span>
                      <div>
                        <span className="score-label-sm">Foco</span>
                        <strong>{formatarTempo(item.score_foco_segundos)}</strong>
                      </div>
                    </div>
                    <div className="score-badge activity-badge">
                      <span className="score-icon">🎯</span>
                      <div>
                        <span className="score-label-sm">Atividade</span>
                        <strong>{item.score_aprendizagem}%</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* ABA 2: TURMAS (LISTA E DETALHES COM BOTÕES CONDICIONAIS) */}
      {/* ==================================================== */}
      {aba === 'turmas' && (
        <div className="tab-content fade-in">
          {/* VISÃO 2A: LISTA DE TURMAS */}
          {!turmaSelecionada ? (
            <div className="turmas-list-section">
              <div className="section-header">
                <div>
                  <h2>Minhas Turmas</h2>
                  <p className="subtitle-text">Selecione uma turma para ver suas aulas e médias específicas.</p>
                </div>

                {/* BOTÃO PRINCIPAL: Só aparece se o aluno JÁ tiver pelo menos 1 turma */}
                {turmas.length > 0 && (
                  <button
                    className="btn-primary"
                    onClick={() => setMostrandoFormTurma((prev) => !prev)}
                  >
                    {mostrandoFormTurma ? 'Fechar' : '+ Adicionar Turma'}
                  </button>
                )}
              </div>

              {/* Formulário colapsável para entrar em turma (quando já tem turmas) */}
              {mostrandoFormTurma && turmas.length > 0 && (
                <div className="form-modal-card fade-in">
                  <div className="form-modal-header">
                    <h3>Matricular em Nova Turma</h3>
                    <button
                      type="button"
                      className="btn-icon-close"
                      onClick={() => setMostrandoFormTurma(false)}
                      title="Fechar"
                    >
                      ✕
                    </button>
                  </div>
                  <form onSubmit={handleEntrarTurma} className="inline-add-form">
                    <div className="input-with-label">
                      <label htmlFor="aluno-codigo-turma">Código da Turma *</label>
                      <input
                        id="aluno-codigo-turma"
                        type="text"
                        placeholder="Digite o código fornecido pelo professor (ex: MAT101)"
                        value={codigoTurma}
                        onChange={(e) => setCodigoTurma(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                    <div className="form-actions-row">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setMostrandoFormTurma(false)}
                      >
                        Cancelar
                      </button>
                      <button type="submit" className="btn-primary" disabled={carregando}>
                        {carregando ? 'Entrando...' : 'Confirmar Matrícula'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* BOTÃO PADRÃO EM DESTAQUE: Caso NÃO esteja em nenhuma turma */}
              {turmas.length === 0 ? (
                <div className="empty-turmas-card fade-in">
                  <div className="empty-turmas-icon">🎓</div>
                  <h3>Você ainda não está em nenhuma turma</h3>
                  <p>
                    Peça o código da turma para o seu professor e entre abaixo para começar a participar
                    das aulas e quizzes interativos.
                  </p>
                  <form className="empty-turma-form" onSubmit={handleEntrarTurma}>
                    <input
                      placeholder="Digite o código da turma (ex: MAT101)"
                      value={codigoTurma}
                      onChange={(e) => setCodigoTurma(e.target.value)}
                      required
                    />
                    <button type="submit" className="btn-primary btn-cta-primary" disabled={carregando}>
                      {carregando ? 'Entrando...' : 'Entrar na Turma'}
                    </button>
                  </form>
                </div>
              ) : (
                /* Grid de Turmas Matriculadas */
                <div className="turmas-grid">
                  {turmas.map((t) => (
                    <div
                      key={t.id}
                      className="turma-card"
                      onClick={() => setTurmaSelecionada(t)}
                    >
                      <div className="turma-card-header">
                        <h3>{t.nome}</h3>
                        <span className="turma-code-pill">#{t.codigo_turma}</span>
                      </div>
                      <p className="turma-card-date">
                        Matriculado em: {new Date(t.created_at).toLocaleDateString('pt-BR')}
                      </p>
                      <div className="turma-card-action">
                        <span>Ver aulas e notas</span>
                        <span className="arrow-icon">→</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* VISÃO 2B: DETALHES DA TURMA SELECIONADA E SUAS AULAS */
            <div className="turma-detail-view fade-in">
              {/* Header Moderno da Turma e Ações */}
              <div className="turma-page-header">
                <div className="turma-header-top-row">
                  <button
                    className="btn-back-pill"
                    onClick={() => {
                      setTurmaSelecionada(null)
                      setMostrandoFormAula(false)
                    }}
                  >
                    ← Voltar para Minhas Turmas
                  </button>
                  <button
                    type="button"
                    className="btn-danger-sm"
                    onClick={() => handleSairTurma(turmaSelecionada.id, turmaSelecionada.nome)}
                    title="Sair desta turma"
                  >
                    🚪 Sair da Turma
                  </button>
                </div>

                <div className="turma-header-title-row">
                  <div className="turma-title-group">
                    <h2 className="turma-title-text">{turmaSelecionada.nome}</h2>
                    <span className="turma-code-badge" title="Código de Acesso da Turma">
                      #{turmaSelecionada.codigo_turma}
                    </span>
                  </div>
                </div>
              </div>

              {/* Médias Específicas desta Turma */}
              <div className="turma-metrics-row">
                <div className="turma-stat-pill">
                  <span className="pill-label">⏱️ Média de Foco nesta Turma:</span>
                  <span className="pill-value">
                    {detalhesTurma ? formatarTempo(detalhesTurma.media_foco_segundos) : '--'}
                  </span>
                </div>
                <div className="turma-stat-pill">
                  <span className="pill-label">🎯 Média de Atividades:</span>
                  <span className="pill-value">
                    {detalhesTurma ? `${detalhesTurma.media_atividade}%` : '--'}
                  </span>
                </div>
                <div className="turma-stat-pill">
                  <span className="pill-label">📚 Presença / Participação:</span>
                  <span className="pill-value">
                    {detalhesTurma
                      ? `${detalhesTurma.aulas_participadas} de ${detalhesTurma.total_aulas} aulas`
                      : '--'}
                  </span>
                </div>
              </div>

              {/* Barra de Ações da Turma */}
              <div className="aulas-section-header">
                <div>
                  <h3>Aulas da Turma</h3>
                  <p className="subtitle-text">
                    Veja os scores de cada aula ou entre na aula que estiver em andamento.
                  </p>
                </div>
                <button
                  className="btn-secondary"
                  onClick={() => setMostrandoFormAula((prev) => !prev)}
                >
                  {mostrandoFormAula ? 'Fechar' : '🔑 Entrar com código da aula'}
                </button>
              </div>

              {/* Formulário rápido para código de aula avulso */}
              {mostrandoFormAula && (
                <div className="form-modal-card fade-in">
                  <div className="form-modal-header">
                    <h4>Entrar em Aula com Código</h4>
                    <button
                      type="button"
                      className="btn-icon-close"
                      onClick={() => setMostrandoFormAula(false)}
                      title="Fechar"
                    >
                      ✕
                    </button>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (codigoAula.trim()) handleEntrarAulaPorCodigo(codigoAula)
                    }}
                    className="inline-add-form"
                  >
                    <div className="input-with-label">
                      <label htmlFor="aluno-codigo-aula">Código da Aula de hoje *</label>
                      <input
                        id="aluno-codigo-aula"
                        type="text"
                        placeholder="Ex: ALG01, FIS02..."
                        value={codigoAula}
                        onChange={(e) => setCodigoAula(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                    <div className="form-actions-row">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setMostrandoFormAula(false)}
                      >
                        Cancelar
                      </button>
                      <button type="submit" className="btn-primary" disabled={carregando}>
                        {carregando ? 'Entrando...' : 'Entrar na Aula'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Lista de Aulas */}
              <div className="aulas-list">
                {detalhesTurma && detalhesTurma.aulas.length === 0 ? (
                  <div className="empty-aulas-box">
                    <p>Nenhuma aula registrada nesta turma ainda.</p>
                  </div>
                ) : (
                  detalhesTurma?.aulas.map((a) => (
                    <div
                      key={a.id}
                      className={`aula-item-card ${a.status === 'em_andamento' ? 'live-border' : ''}`}
                    >
                      <div className="aula-item-main">
                        <div className="aula-item-title-row">
                          <span className="aula-title-text">{a.titulo}</span>
                          <span className="codigo-pill">#{a.codigo_aula}</span>
                          {a.status === 'em_andamento' && (
                            <span className="status-badge status-live">
                              <span className="pulsing-dot" /> Em andamento
                            </span>
                          )}
                          {a.status === 'encerrada' && (
                            <span className="status-badge status-ended">Encerrada</span>
                          )}
                          {a.status === 'nao_iniciada' && (
                            <span className="status-badge status-pending">Aguardando início</span>
                          )}
                        </div>

                        {/* Médias e Desempenho desta Aula Específica */}
                        <div className="aula-scores-row">
                          {a.participou ? (
                            <>
                              <span className="score-tag focus-tag">
                                ⏱️ Foco: {formatarTempo(a.score_foco_segundos)}
                              </span>
                              <span className="score-tag activity-tag">
                                🎯 Atividade: {a.score_aprendizagem}%
                              </span>
                            </>
                          ) : (
                            <span className="score-tag not-participated">
                              Ainda sem participação registrada
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ação de Entrar na Aula */}
                      <div className="aula-item-actions">
                        {a.status === 'em_andamento' ? (
                          <button
                            className="btn-primary btn-join-live"
                            onClick={() => handleEntrarAulaPorCodigo(a.codigo_aula)}
                            disabled={carregando}
                          >
                            Entrar na Aula Agora
                          </button>
                        ) : (
                          <button
                            className="btn-ghost"
                            onClick={() => handleEntrarAulaPorCodigo(a.codigo_aula)}
                            disabled={carregando}
                          >
                            Acessar Aula
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Barra de Navegação Inferior (Visão Geral / Minhas Turmas) */}
      <nav className="bottom-nav-dock">
        <div className="bottom-nav-inner">
          <button
            className={`student-tab-btn ${aba === 'geral' ? 'active' : ''}`}
            onClick={() => {
              setAba('geral')
              setTurmaSelecionada(null)
              setErro(null)
            }}
          >
            <span className="tab-icon">📊</span>
            <span>Visão Geral</span>
          </button>
          <button
            className={`student-tab-btn ${aba === 'turmas' ? 'active' : ''}`}
            onClick={() => {
              setAba('turmas')
              setTurmaSelecionada(null)
              setErro(null)
            }}
          >
            <span className="tab-icon">🏫</span>
            <span>Minhas Turmas</span>
            {turmas.length > 0 && <span className="tab-counter">{turmas.length}</span>}
          </button>
        </div>
      </nav>
    </div>
  )
}
