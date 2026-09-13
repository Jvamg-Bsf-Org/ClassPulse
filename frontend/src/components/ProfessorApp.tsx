import { useEffect, useState } from 'react'
import {
  criarAula,
  criarTurma,
  encerrarAula,
  excluirTurma,
  listarAulasDaTurma,
  minhasTurmas,
  mudarModoAula,
  obterEstatisticasTurmaProfessor,
  obterMetricasProfessor,
  obterPartidaAtiva,
  type Aula,
  type EstatisticasTurmaProfessor,
  type MetricasProfessor,
  type Turma,
} from '../services/api'
import TeacherGameDashboard from './TeacherGameDashboard'
import TeacherQuizManager from './TeacherQuizManager'

type AbaPrincipal = 'geral' | 'turmas'
type SubAbaTurma = 'aulas' | 'quizzes' | 'estatisticas'
type AbaControleAula = 'controle' | 'atividade'

function formatarTempo(segundos: number): string {
  if (!segundos || segundos <= 0) return '0s'
  const min = Math.floor(segundos / 60)
  const seg = Math.round(segundos % 60)
  if (min === 0) return `${seg}s`
  if (seg === 0) return `${min}min`
  return `${min}m ${seg}s`
}

export default function ProfessorApp() {
  // Navegação
  const [abaPrincipal, setAbaPrincipal] = useState<AbaPrincipal>('geral')
  const [subAbaTurma, setSubAbaTurma] = useState<SubAbaTurma>('aulas')
  const [abaControle, setAbaControle] = useState<AbaControleAula>('controle')

  // Dados
  const [metricas, setMetricas] = useState<MetricasProfessor | null>(null)
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [turmaSelecionada, setTurmaSelecionada] = useState<Turma | null>(null)
  const [aulas, setAulas] = useState<Aula[]>([])
  const [aulaSelecionada, setAulaSelecionada] = useState<Aula | null>(null)
  const [estatisticasTurma, setEstatisticasTurma] = useState<EstatisticasTurmaProfessor | null>(null)
  const [activePartidaId, setActivePartidaId] = useState<number | null>(null)

  // Formulários
  const [nomeTurma, setNomeTurma] = useState('')
  const [tituloAula, setTituloAula] = useState('')
  const [mostrandoFormTurma, setMostrandoFormTurma] = useState(false)
  const [mostrandoFormAula, setMostrandoFormAula] = useState(false)

  // Feedback
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  // Carregar dados gerais
  async function carregarDadosGerais() {
    setCarregando(true)
    try {
      const [m, t] = await Promise.all([
        obterMetricasProfessor().catch(() => null),
        minhasTurmas(),
      ])
      if (m) setMetricas(m)
      setTurmas(t)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar dados do professor.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDadosGerais()
  }, [])

  // Carregar aulas e estatísticas da turma selecionada
  async function carregarDadosTurma(turmaId: number) {
    try {
      const [listaAulas, stats] = await Promise.all([
        listarAulasDaTurma(turmaId),
        obterEstatisticasTurmaProfessor(turmaId).catch(() => null),
      ])
      setAulas(listaAulas)
      setEstatisticasTurma(stats)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar aulas da turma.')
    }
  }

  useEffect(() => {
    if (!turmaSelecionada) {
      setAulas([])
      setEstatisticasTurma(null)
      return
    }
    carregarDadosTurma(turmaSelecionada.id)
  }, [turmaSelecionada])

  // Partida ativa na aula selecionada
  useEffect(() => {
    if (!aulaSelecionada) {
      setActivePartidaId(null)
      return
    }
    obterPartidaAtiva(aulaSelecionada.id)
      .then((p) => setActivePartidaId(p?.id ?? null))
      .catch(() => setActivePartidaId(null))
  }, [aulaSelecionada])

  // Handlers de Turma
  async function handleCriarTurma(e: React.FormEvent) {
    e.preventDefault()
    if (!nomeTurma.trim()) return
    setErro(null)
    setSucesso(null)
    setCarregando(true)
    try {
      const t = await criarTurma(nomeTurma.trim())
      setNomeTurma('')
      setMostrandoFormTurma(false)
      setSucesso(`Turma "${t.nome}" criada com sucesso! Código: ${t.codigo_turma}`)
      setTurmas((prev) => [t, ...prev])
      setTurmaSelecionada(t)
      setSubAbaTurma('aulas')
      carregarDadosGerais()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar turma.')
    } finally {
      setCarregando(false)
    }
  }

  async function handleExcluirTurma(turmaId: number, turmaNome: string) {
    if (
      !confirm(
        `ATENÇÃO: Deseja realmente excluir a turma "${turmaNome}"?\n\nEsta ação excluirá permanentemente a turma para você e para TODOS os alunos matriculados, além de todas as aulas, quizzes e dados relacionados.`
      )
    ) {
      return
    }

    setCarregando(true)
    setErro(null)
    setSucesso(null)
    try {
      await excluirTurma(turmaId)
      setSucesso(`A turma "${turmaNome}" foi excluída com sucesso.`)
      if (turmaSelecionada?.id === turmaId) {
        setTurmaSelecionada(null)
        setAulaSelecionada(null)
      }
      setTurmas((prev) => prev.filter((t) => t.id !== turmaId))
      await carregarDadosGerais()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao excluir turma.')
    } finally {
      setCarregando(false)
    }
  }

  // Handlers de Aula
  async function handleCriarAula(e: React.FormEvent) {
    e.preventDefault()
    if (!turmaSelecionada) return
    setErro(null)
    setSucesso(null)
    setCarregando(true)
    try {
      const a = await criarAula(turmaSelecionada.id, tituloAula.trim() || 'Nova Aula')
      setTituloAula('')
      setMostrandoFormAula(false)
      setSucesso(`Aula "${a.titulo}" criada! Código de entrada: ${a.codigo_aula}`)
      setAulas((prev) => [a, ...prev])
      setAulaSelecionada(a)
      setAbaControle('controle')
      carregarDadosGerais()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar aula.')
    } finally {
      setCarregando(false)
    }
  }

  async function handleModo(modo: Aula['modo_atual']) {
    if (!aulaSelecionada) return
    try {
      const a = await mudarModoAula(aulaSelecionada.id, modo)
      setAulaSelecionada(a)
      setAulas((prev) => prev.map((item) => (item.id === a.id ? a : item)))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao alterar modo da aula.')
    }
  }

  async function handleEncerrarAula() {
    if (!aulaSelecionada) return
    if (
      !confirm(
        'Deseja encerrar esta aula? Os alunos não poderão mais reportar foco nem participar das atividades.'
      )
    ) {
      return
    }
    try {
      const a = await encerrarAula(aulaSelecionada.id)
      setAulaSelecionada(a)
      setAulas((prev) => prev.map((item) => (item.id === a.id ? a : item)))
      setSucesso('Aula encerrada com sucesso.')
      carregarDadosGerais()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao encerrar aula.')
    }
  }

  function copiarParaClipboard(texto: string, rotulo: string) {
    navigator.clipboard.writeText(texto)
    setSucesso(`${rotulo} copiado para a área de transferência!`)
    setTimeout(() => setSucesso(null), 3000)
  }

  // ========================================================
  // MODO: CONTROLE AO VIVO DA AULA SELECIONADA
  // ========================================================
  if (aulaSelecionada && turmaSelecionada) {
    return (
      <div className="aluno-app-container pulse-fade-in" style={{ maxWidth: 960 }}>
        {/* Header Moderno da Aula & Navegação Superior */}
        <div className="turma-page-header">
          <div className="turma-header-top-row">
            <button
              className="btn-back-pill"
              onClick={() => {
                setAulaSelecionada(null)
                carregarDadosTurma(turmaSelecionada.id)
              }}
            >
              ← Voltar para Turma ({turmaSelecionada.nome})
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className={`status-pill status-${aulaSelecionada.status}`}>
                {aulaSelecionada.status === 'em_andamento'
                  ? '🟢 Ao Vivo'
                  : aulaSelecionada.status === 'encerrada'
                    ? '⚪ Encerrada'
                    : '⏳ Não iniciada'}
              </span>
              {aulaSelecionada.status !== 'encerrada' && (
                <button className="btn-danger-sm" onClick={handleEncerrarAula}>
                  🛑 Encerrar Aula
                </button>
              )}
            </div>
          </div>

          <div className="turma-header-title-row">
            <div className="turma-title-group">
              <h2 className="turma-title-text">{aulaSelecionada.titulo}</h2>
              <span className="turma-code-badge" title="Código de Entrada da Sala">
                Sala: {aulaSelecionada.codigo_aula}
              </span>
            </div>
          </div>

          {/* Sub-navegação do controle de aula */}
          <div className="turma-top-nav">
            <button
              className={`turma-nav-btn ${abaControle === 'controle' ? 'active' : ''}`}
              onClick={() => setAbaControle('controle')}
            >
              <span className="nav-icon">🎛️</span>
              <span>Painel e Dinâmica</span>
            </button>
            <button
              className={`turma-nav-btn ${abaControle === 'atividade' ? 'active' : ''}`}
              onClick={() => setAbaControle('atividade')}
            >
              <span className="nav-icon">⚡</span>
              <span>Disparar Atividade na Sala</span>
            </button>
          </div>
        </div>

        {/* Feedback Messages */}
        {erro && (
          <div className="alert-box alert-error">
            <span>⚠️ {erro}</span>
            <button type="button" className="btn-close-alert" onClick={() => setErro(null)} title="Fechar">✕</button>
          </div>
        )}
        {sucesso && (
          <div className="alert-box alert-success">
            <span>✅ {sucesso}</span>
            <button type="button" className="btn-close-alert" onClick={() => setSucesso(null)} title="Fechar">✕</button>
          </div>
        )}

        {/* Banner com Código de Acesso da Aula */}
        <div className="live-aula-code-banner">
          <div>
            <span className="live-label">CÓDIGO DE ENTRADA PARA OS ALUNOS:</span>
            <div className="live-code-row">
              <span className="live-code-big">{aulaSelecionada.codigo_aula}</span>
              <button
                className="btn-copy-code"
                onClick={() => copiarParaClipboard(aulaSelecionada.codigo_aula, 'Código da Aula')}
                title="Copiar código"
              >
                📋 Copiar Código
              </button>
            </div>
            <p className="live-code-sub">
              Projete este código ou compartilhe com os alunos para eles entrarem no app.
            </p>
          </div>

          {/* Seletor de Modo de Aula */}
          <div className="live-mode-box">
            <span className="mode-box-label">Modo Atual da Aula:</span>
            <div className="modo-toggle-row">
              <button
                className={aulaSelecionada.modo_atual === 'livre' ? 'active' : ''}
                onClick={() => handleModo('livre')}
              >
                Modo Livre
              </button>
              <button
                className={aulaSelecionada.modo_atual === 'foco' ? 'active' : ''}
                onClick={() => handleModo('foco')}
              >
                🎯 Modo Foco
              </button>
            </div>
          </div>
        </div>

        {abaControle === 'controle' && (
          <div className="tab-content fade-in" style={{ marginTop: '1rem' }}>
            <div className="aula-control-info-card">
              <h3>Orientações da Sessão</h3>
              <ul>
                <li>
                  <strong>🎯 Modo Foco:</strong> Ativa os sensores de atenção e cronômetros de concentração nos celulares dos alunos em tempo real.
                </li>
                <li>
                  <strong>⚡ Disparar Atividade:</strong> Permite escolher um quiz do banco desta turma e disparar perguntas síncronas com ranking ou metas coletivas.
                </li>
                <li>
                  <strong>🔒 Privacidade:</strong> O score de foco de cada aluno permanece individual e formativo.
                </li>
              </ul>
              <div style={{ marginTop: '1rem' }}>
                <button
                  className="btn-primary"
                  onClick={() => setAbaControle('atividade')}
                >
                  Ir para Disparo de Atividades →
                </button>
              </div>
            </div>
          </div>
        )}

        {abaControle === 'atividade' && (
          <div className="tab-content fade-in" style={{ marginTop: '1rem' }}>
            <TeacherGameDashboard
              aulaId={aulaSelecionada.id}
              turmaId={turmaSelecionada.id}
              activePartidaId={activePartidaId}
              onPartidaCriada={(id) => setActivePartidaId(id)}
            />
          </div>
        )}
      </div>
    )
  }

  // ========================================================
  // DASHBOARD PRINCIPAL DO PROFESSOR (ABAS: GERAL & TURMAS)
  // ========================================================
  return (
    <div className="aluno-app-container pulse-fade-in" style={{ maxWidth: 960 }}>
      {/* Mensagens de Alerta */}
      {erro && (
        <div className="alert-box alert-error">
          <span>⚠️ {erro}</span>
          <button type="button" className="btn-close-alert" onClick={() => setErro(null)} title="Fechar">✕</button>
        </div>
      )}
      {sucesso && (
        <div className="alert-box alert-success">
          <span>✅ {sucesso}</span>
          <button type="button" className="btn-close-alert" onClick={() => setSucesso(null)} title="Fechar">✕</button>
        </div>
      )}


      {/* ==================================================== */}
      {/* ABA 1: VISÃO GERAL (MÉDIAS GERAIS E RESUMO)          */}
      {/* ==================================================== */}
      {abaPrincipal === 'geral' && (
        <div className="tab-content fade-in">
          <div className="overview-header">
            <div>
              <h2>Visão Geral do Professor</h2>
              <p className="subtitle-text">
                Acompanhe o engajamento consolidado das suas turmas, médias de foco e atividades interativas.
              </p>
            </div>
          </div>

          {/* Grid de Métricas Principais */}
          <div className="metrics-grid">
            <div className="metric-card focus-card">
              <div className="metric-header">
                <span className="metric-title">Média de Foco Geral</span>
                <span className="metric-badge-icon">⏱️</span>
              </div>
              <div className="metric-value">
                {metricas ? formatarTempo(metricas.media_foco_geral_segundos) : '--'}
              </div>
              <p className="metric-subtext">Média de tempo em foco dos alunos durante as aulas</p>
            </div>

            <div className="metric-card activity-card">
              <div className="metric-header">
                <span className="metric-title">Aproveitamento Médio</span>
                <span className="metric-badge-icon">🎯</span>
              </div>
              <div className="metric-value">
                {metricas ? `${metricas.media_atividades_geral}%` : '--'}
              </div>
              <div className="metric-progress-bar">
                <div
                  className="metric-progress-fill"
                  style={{ width: `${Math.min(metricas?.media_atividades_geral || 0, 100)}%` }}
                />
              </div>
              <p className="metric-subtext">Aproveitamento médio dos alunos nos quizzes</p>
            </div>

            <div
              className="metric-card stat-card metric-clickable"
              onClick={() => {
                setAbaPrincipal('turmas')
                setTurmaSelecionada(null)
              }}
              title="Acessar Minhas Turmas"
            >
              <div className="metric-header">
                <span className="metric-title">Turmas</span>
                <span className="metric-badge-icon">📚</span>
              </div>
              <div className="metric-value">{metricas ? metricas.total_turmas : turmas.length}</div>
              <p className="metric-subtext">Turmas ativas sob sua gestão →</p>
            </div>

            <div className="metric-card stat-card">
              <div className="metric-header">
                <span className="metric-title">Alunos Matriculados</span>
                <span className="metric-badge-icon">👥</span>
              </div>
              <div className="metric-value">{metricas ? metricas.total_alunos : 0}</div>
              <p className="metric-subtext">Total de alunos matriculados nas turmas</p>
            </div>

            <div className="metric-card stat-card">
              <div className="metric-header">
                <span className="metric-title">Aulas Realizadas</span>
                <span className="metric-badge-icon">📝</span>
              </div>
              <div className="metric-value">{metricas ? metricas.total_aulas : 0}</div>
              <p className="metric-subtext">Total de aulas criadas</p>
            </div>
          </div>

          {/* Aulas Recentes */}
          {metricas && metricas.aulas_recentes.length > 0 && (
            <div style={{ marginTop: '2rem' }}>
              <div className="section-header">
                <div>
                  <h3>Aulas Recentes</h3>
                  <p className="subtitle-text">Últimas sessões realizadas com participação dos alunos:</p>
                </div>
              </div>

              <div className="history-list-grid">
                {metricas.aulas_recentes.map((item) => (
                  <div key={item.id} className="history-card-item">
                    <div className="history-item-top">
                      <span className="history-turma-badge">{item.turma_nome}</span>
                      <span className="history-date">
                        {new Date(item.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <h3 className="history-title">{item.titulo}</h3>
                    <div className="history-metrics-row">
                      <div className="score-badge focus-badge">
                        <span className="score-icon">⏱️</span>
                        <div>
                          <span className="score-label-sm">Foco Médio</span>
                          <strong>{formatarTempo(item.media_foco_segundos)}</strong>
                        </div>
                      </div>
                      <div className="score-badge activity-badge">
                        <span className="score-icon">🎯</span>
                        <div>
                          <span className="score-label-sm">Aproveitamento</span>
                          <strong>{item.media_atividade}%</strong>
                        </div>
                      </div>
                      <div className="score-badge participants-badge">
                        <span className="score-icon">👥</span>
                        <div>
                          <span className="score-label-sm">Participantes</span>
                          <strong>{item.total_alunos_participantes}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* ABA 2: MINHAS TURMAS (GESTÃO DE TURMAS, AULAS & QUIZZES) */}
      {/* ==================================================== */}
      {abaPrincipal === 'turmas' && (
        <div className="tab-content fade-in">
          {/* VISÃO 2A: LISTA GERAL DE TURMAS DO PROFESSOR */}
          {!turmaSelecionada ? (
            <div className="turmas-list-section">
              <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2>Minhas Turmas</h2>
                  <p className="subtitle-text">
                    Gerencie suas turmas, crie aulas e acesse o banco de quizzes específico de cada turma.
                  </p>
                </div>

                <button
                  className="btn-primary"
                  onClick={() => setMostrandoFormTurma(!mostrandoFormTurma)}
                >
                  {mostrandoFormTurma ? '✕ Cancelar' : '＋ Criar Nova Turma'}
                </button>
              </div>

              {/* Formulário de Criação de Turma */}
              {mostrandoFormTurma && (
                <div className="form-modal-card fade-in">
                  <div className="form-modal-header">
                    <h3>Cadastrar Nova Turma</h3>
                    <button
                      type="button"
                      className="btn-icon-close"
                      onClick={() => setMostrandoFormTurma(false)}
                      title="Fechar"
                    >
                      ✕
                    </button>
                  </div>
                  <form onSubmit={handleCriarTurma} className="inline-add-form">
                    <div className="input-with-label">
                      <label htmlFor="input-nome-turma">Nome da Turma *</label>
                      <input
                        id="input-nome-turma"
                        type="text"
                        placeholder="Ex: Biologia 2º Ano B, Matemática 9A..."
                        value={nomeTurma}
                        onChange={(e) => setNomeTurma(e.target.value)}
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
                        {carregando ? 'Criando...' : 'Salvar Turma'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Grid de Turmas */}
              {turmas.length === 0 ? (
                <div className="empty-turmas-card fade-in" style={{ marginTop: '1.5rem' }}>
                  <div className="empty-turmas-icon">🏫</div>
                  <h3>Nenhuma turma cadastrada ainda</h3>
                  <p>Crie sua primeira turma para poder ministrar aulas, disparar quizzes e monitorar a sala.</p>
                  <button className="btn-primary" onClick={() => setMostrandoFormTurma(true)}>
                    Criar Minha Primeira Turma
                  </button>
                </div>
              ) : (
                <div className="turmas-grid" style={{ marginTop: '1.5rem' }}>
                  {turmas.map((t) => (
                    <div key={t.id} className="turma-card">
                      <div className="turma-card-header">
                        <h3>{t.nome}</h3>
                        <span className="turma-code-pill">#{t.codigo_turma}</span>
                      </div>
                      <p className="turma-card-date">
                        Criada em: {new Date(t.created_at).toLocaleDateString('pt-BR')}
                      </p>

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn-copy-code"
                          style={{ flex: 1 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            copiarParaClipboard(t.codigo_turma, 'Código da Turma')
                          }}
                        >
                          📋 Copiar Código
                        </button>
                        <button
                          type="button"
                          className="btn-danger-sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleExcluirTurma(t.id, t.nome)
                          }}
                          title="Excluir turma"
                        >
                          🗑️
                        </button>
                      </div>

                      <div
                        className="turma-card-action"
                        style={{ marginTop: '0.75rem', cursor: 'pointer' }}
                        onClick={() => {
                          setTurmaSelecionada(t)
                          setSubAbaTurma('aulas')
                        }}
                      >
                        <span>Gerenciar Aulas & Quizzes</span>
                        <span className="arrow-icon">→</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* VISÃO 2B: DENTRO DA TURMA SELECIONADA */
            <div className="turma-detail-view fade-in">
              {/* Header Moderno da Turma & Nav Bar de Cima */}
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

                  <div className="turma-header-actions">
                    <button
                      type="button"
                      className="btn-copy-code"
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                      onClick={() => copiarParaClipboard(turmaSelecionada.codigo_turma, 'Código da Turma')}
                      title="Copiar código de acesso para os alunos"
                    >
                      📋 Copiar Código
                    </button>

                    <button
                      type="button"
                      className="btn-danger-sm"
                      onClick={() => handleExcluirTurma(turmaSelecionada.id, turmaSelecionada.nome)}
                      title="Excluir turma permanentemente"
                    >
                      🗑️ Excluir Turma
                    </button>
                  </div>
                </div>

                <div className="turma-header-title-row">
                  <div className="turma-title-group">
                    <h2 className="turma-title-text">{turmaSelecionada.nome}</h2>
                    <span className="turma-code-badge" title="Código de Acesso da Turma">
                      #{turmaSelecionada.codigo_turma}
                    </span>
                  </div>
                </div>

                {/* Nav Bar de Cima da Turma */}
                <div className="turma-top-nav">
                  <button
                    className={`turma-nav-btn ${subAbaTurma === 'aulas' ? 'active' : ''}`}
                    onClick={() => setSubAbaTurma('aulas')}
                  >
                    <span className="nav-icon">📝</span>
                    <span>Aulas da Turma</span>
                    {aulas.length > 0 && <span className="nav-counter">{aulas.length}</span>}
                  </button>

                  <button
                    className={`turma-nav-btn ${subAbaTurma === 'quizzes' ? 'active' : ''}`}
                    onClick={() => setSubAbaTurma('quizzes')}
                  >
                    <span className="nav-icon">📚</span>
                    <span>Banco de Quizzes</span>
                  </button>

                  <button
                    className={`turma-nav-btn ${subAbaTurma === 'estatisticas' ? 'active' : ''}`}
                    onClick={() => {
                      setSubAbaTurma('estatisticas')
                      carregarDadosTurma(turmaSelecionada.id)
                    }}
                  >
                    <span className="nav-icon">📊</span>
                    <span>Estatísticas da Turma</span>
                  </button>
                </div>
              </div>

              {/* SUB-ABA 1: AULAS */}
              {subAbaTurma === 'aulas' && (
                <div className="tab-content fade-in" style={{ marginTop: '1rem' }}>
                  <div className="aulas-section-header">
                    <div>
                      <h3>Aulas da Turma</h3>
                      <p className="subtitle-text">
                        Inicie ou gerencie as aulas e controle os modos em tempo real.
                      </p>
                    </div>

                    <button
                      className="btn-primary"
                      onClick={() => setMostrandoFormAula(!mostrandoFormAula)}
                    >
                      {mostrandoFormAula ? '✕ Cancelar' : '＋ Criar Nova Aula'}
                    </button>
                  </div>

                  {mostrandoFormAula && (
                    <div className="form-modal-card fade-in">
                      <div className="form-modal-header">
                        <h4>Cadastrar Nova Aula em {turmaSelecionada.nome}</h4>
                        <button
                          type="button"
                          className="btn-icon-close"
                          onClick={() => setMostrandoFormAula(false)}
                          title="Fechar"
                        >
                          ✕
                        </button>
                      </div>
                      <form onSubmit={handleCriarAula} className="inline-add-form">
                        <div className="input-with-label">
                          <label htmlFor="input-titulo-aula">Título da Aula *</label>
                          <input
                            id="input-titulo-aula"
                            type="text"
                            placeholder="Ex: Aula 1 - Estruturas Celulares, Cinemática..."
                            value={tituloAula}
                            onChange={(e) => setTituloAula(e.target.value)}
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
                            {carregando ? 'Criando...' : 'Criar Aula'}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Barra de Resumo Contável de Aulas */}
                  {aulas.length > 0 && (
                    <div className="aulas-summary-bar">
                      <div className="summary-pill">
                        <span className="pill-icon">📚</span>
                        <span>Total de Aulas: <strong>{aulas.length}</strong></span>
                      </div>
                      <div className="summary-pill live-pill">
                        <span className="pill-icon">🟢</span>
                        <span>Ao Vivo: <strong>{aulas.filter(a => a.status === 'em_andamento').length}</strong></span>
                      </div>
                      <div className="summary-pill">
                        <span className="pill-icon">⚪</span>
                        <span>Encerradas: <strong>{aulas.filter(a => a.status === 'encerrada').length}</strong></span>
                      </div>
                    </div>
                  )}

                  {aulas.length === 0 ? (
                    <div className="empty-aulas-box" style={{ marginTop: '1.25rem' }}>
                      <p>Nenhuma aula criada nesta turma ainda.</p>
                      <button className="btn-primary" onClick={() => setMostrandoFormAula(true)}>
                        Criar Primeira Aula
                      </button>
                    </div>
                  ) : (
                    <div className="turmas-grid aulas-grid" style={{ marginTop: '1.25rem' }}>
                      {aulas.map((a) => {
                        const isAoVivo = a.status === 'em_andamento'
                        return (
                          <div key={a.id} className={`turma-card ${isAoVivo ? 'live-border' : ''}`}>
                            <div className="turma-card-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                <span className={`status-pill status-${a.status}`}>
                                  {isAoVivo ? '🟢 Ao Vivo' : a.status === 'encerrada' ? '⚪ Encerrada' : '⏳ Não Iniciada'}
                                </span>
                                <span className="mode-badge">
                                  {a.modo_atual === 'foco' ? '🎯 Foco' : a.modo_atual === 'atividade' ? '⚡ Atividade' : 'Livre'}
                                </span>
                              </div>
                              <span className="turma-code-pill">#{a.codigo_aula}</span>
                            </div>

                            <h3 style={{ margin: '0.75rem 0 0.25rem 0', fontSize: '1.15rem', color: '#fff' }}>{a.titulo}</h3>

                            <p className="turma-card-date">
                              Criada em: {new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>

                            <div style={{ marginTop: 'auto', paddingTop: '0.85rem' }}>
                              <button
                                className={`btn-primary ${isAoVivo ? 'btn-join-live' : ''}`}
                                style={{ width: '100%', justifyContent: 'center' }}
                                onClick={() => {
                                  setAulaSelecionada(a)
                                  setAbaControle('controle')
                                }}
                              >
                                {isAoVivo ? '🎛️ Acessar Painel Ao Vivo →' : 'Gerenciar / Iniciar Aula →'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SUB-ABA 2: BANCO DE QUIZZES DA TURMA */}
              {subAbaTurma === 'quizzes' && (
                <div className="tab-content fade-in" style={{ marginTop: '1rem' }}>
                  <TeacherQuizManager
                    turmaId={turmaSelecionada.id}
                    onIniciarPartidaComQuiz={() => {
                      setSubAbaTurma('aulas')
                      alert('Para disparar um quiz, acesse uma aula ativa e vá na aba "Disparar Atividade".')
                    }}
                  />
                </div>
              )}

              {/* SUB-ABA 3: ESTATÍSTICAS DA TURMA */}
              {subAbaTurma === 'estatisticas' && (
                <div className="tab-content fade-in" style={{ marginTop: '1rem' }}>
                  {estatisticasTurma ? (
                    <div>
                      {/* Grid de Resumo da Turma */}
                      <div className="metrics-grid">
                        <div className="metric-card focus-card">
                          <div className="metric-header">
                            <span className="metric-title">Média de Foco da Turma</span>
                            <span className="metric-badge-icon">⏱️</span>
                          </div>
                          <div className="metric-value">
                            {formatarTempo(estatisticasTurma.media_foco_segundos)}
                          </div>
                          <p className="metric-subtext">Tempo médio em foco nas aulas desta turma</p>
                        </div>

                        <div className="metric-card activity-card">
                          <div className="metric-header">
                            <span className="metric-title">Média de Atividades</span>
                            <span className="metric-badge-icon">🎯</span>
                          </div>
                          <div className="metric-value">
                            {estatisticasTurma.media_atividade}%
                          </div>
                          <div className="metric-progress-bar">
                            <div
                              className="metric-progress-fill"
                              style={{ width: `${Math.min(estatisticasTurma.media_atividade, 100)}%` }}
                            />
                          </div>
                          <p className="metric-subtext">Aproveitamento médio dos quizzes desta turma</p>
                        </div>

                        <div className="metric-card stat-card">
                          <div className="metric-header">
                            <span className="metric-title">Alunos Matriculados</span>
                            <span className="metric-badge-icon">👥</span>
                          </div>
                          <div className="metric-value">{estatisticasTurma.total_alunos}</div>
                          <p className="metric-subtext">Alunos com acesso a esta turma</p>
                        </div>

                        <div className="metric-card stat-card">
                          <div className="metric-header">
                            <span className="metric-title">Total de Aulas</span>
                            <span className="metric-badge-icon">📝</span>
                          </div>
                          <div className="metric-value">{estatisticasTurma.total_aulas}</div>
                          <p className="metric-subtext">Aulas criadas nesta turma</p>
                        </div>
                      </div>

                      {/* Lista de Desempenho dos Alunos */}
                      <div className="teacher-ranking-card" style={{ marginTop: '2rem' }}>
                        <div className="card-header-with-badge">
                          <h3>👥 Alunos Matriculados e Desempenho</h3>
                          <span className="badge-counter">{estatisticasTurma.alunos.length} alunos</span>
                        </div>

                        {estatisticasTurma.alunos.length === 0 ? (
                          <p style={{ padding: '1.5rem', color: 'var(--text-muted)' }}>
                            Nenhum aluno matriculado nesta turma ainda. Passe o código <strong>#{turmaSelecionada.codigo_turma}</strong> para que seus alunos ingressem.
                          </p>
                        ) : (
                          <div className="ranking-table-responsive">
                            <table className="teacher-table">
                              <thead>
                                <tr>
                                  <th>Nome do Aluno</th>
                                  <th>Email</th>
                                  <th style={{ textAlign: 'center' }}>Aulas Assistidas</th>
                                  <th style={{ textAlign: 'right' }}>Foco Médio</th>
                                  <th style={{ textAlign: 'right' }}>Aproveitamento</th>
                                </tr>
                              </thead>
                              <tbody>
                                {estatisticasTurma.alunos.map((al) => (
                                  <tr key={al.id}>
                                    <td>
                                      <strong>{al.nome}</strong>
                                    </td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{al.email}</td>
                                    <td style={{ textAlign: 'center' }}>
                                      {al.total_aulas_participadas} de {estatisticasTurma.total_aulas}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                      {formatarTempo(al.media_foco_segundos)}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary, #3b82f6)' }}>
                                      {al.media_atividade}%
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando estatísticas...</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Barra de Navegação Inferior (Visão Geral / Minhas Turmas) */}
      <nav className="bottom-nav-dock">
        <div className="bottom-nav-inner">
          <button
            className={`student-tab-btn ${abaPrincipal === 'geral' ? 'active' : ''}`}
            onClick={() => {
              setAbaPrincipal('geral')
              setTurmaSelecionada(null)
              setErro(null)
            }}
          >
            <span className="tab-icon">📊</span>
            <span>Visão Geral</span>
          </button>

          <button
            className={`student-tab-btn ${abaPrincipal === 'turmas' ? 'active' : ''}`}
            onClick={() => {
              setAbaPrincipal('turmas')
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
