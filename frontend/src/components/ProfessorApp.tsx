import { useEffect, useState } from 'react'
import {
  criarAula,
  criarTurma,
  encerrarAula,
  listarAulasDaTurma,
  minhasTurmas,
  mudarModoAula,
  obterPartidaAtiva,
  type Aula,
  type Turma,
} from '../services/api'
import TeacherGameDashboard from './TeacherGameDashboard'
import TeacherQuizManager from './TeacherQuizManager'

type Aba = 'controle' | 'atividade' | 'quizzes'

export default function ProfessorApp() {
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [turmaSelecionada, setTurmaSelecionada] = useState<Turma | null>(null)
  const [aulas, setAulas] = useState<Aula[]>([])
  const [aulaSelecionada, setAulaSelecionada] = useState<Aula | null>(null)
  const [aba, setAba] = useState<Aba>('controle')
  const [activePartidaId, setActivePartidaId] = useState<number | null>(null)

  const [nomeTurma, setNomeTurma] = useState('')
  const [tituloAula, setTituloAula] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    minhasTurmas().then(setTurmas).catch((e) => setErro(e.message))
  }, [])

  useEffect(() => {
    if (!turmaSelecionada) return
    listarAulasDaTurma(turmaSelecionada.id).then(setAulas).catch((e) => setErro(e.message))
  }, [turmaSelecionada])

  useEffect(() => {
    if (!aulaSelecionada) {
      setActivePartidaId(null)
      return
    }
    obterPartidaAtiva(aulaSelecionada.id)
      .then((p) => setActivePartidaId(p?.id ?? null))
      .catch(() => setActivePartidaId(null))
  }, [aulaSelecionada])

  async function handleCriarTurma(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    try {
      const t = await criarTurma(nomeTurma.trim())
      setNomeTurma('')
      setTurmas((prev) => [...prev, t])
      setTurmaSelecionada(t)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleCriarAula(e: React.FormEvent) {
    e.preventDefault()
    if (!turmaSelecionada) return
    setErro(null)
    try {
      const a = await criarAula(turmaSelecionada.id, tituloAula.trim() || 'Aula')
      setTituloAula('')
      setAulas((prev) => [a, ...prev])
      setAulaSelecionada(a)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleModo(modo: Aula['modo_atual']) {
    if (!aulaSelecionada) return
    try {
      const a = await mudarModoAula(aulaSelecionada.id, modo)
      setAulaSelecionada(a)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleEncerrarAula() {
    if (!aulaSelecionada) return
    if (!confirm('Encerrar esta aula? Os alunos não poderão mais reportar foco nem responder atividades.')) return
    const a = await encerrarAula(aulaSelecionada.id)
    setAulaSelecionada(a)
  }

  if (!turmaSelecionada) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem 1rem' }}>
        <h1>Minhas turmas</h1>
        {erro && <p className="error-text">{erro}</p>}

        <form onSubmit={handleCriarTurma} className="form-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="nome-turma">Nova turma</label>
            <input id="nome-turma" value={nomeTurma} onChange={(e) => setNomeTurma(e.target.value)} placeholder="Ex: Biologia 9A" required />
          </div>
          <button type="submit" className="btn-primary">Criar</button>
        </form>

        <div className="picker-list" style={{ marginTop: '1.5rem' }}>
          {turmas.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nenhuma turma ainda.</p>}
          {turmas.map((t) => (
            <button key={t.id} className="picker-item" onClick={() => setTurmaSelecionada(t)}>
              <span>{t.nome}</span>
              <span className="codigo">{t.codigo_turma}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (!aulaSelecionada) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem 1rem' }}>
        <div className="breadcrumb-bar">
          <button onClick={() => setTurmaSelecionada(null)}>← Turmas</button>
          <span>/ {turmaSelecionada.nome}</span>
        </div>
        <h1>Aulas</h1>
        {erro && <p className="error-text">{erro}</p>}

        <form onSubmit={handleCriarAula} className="form-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="titulo-aula">Nova aula</label>
            <input id="titulo-aula" value={tituloAula} onChange={(e) => setTituloAula(e.target.value)} placeholder="Ex: Aula 1 - Células" required />
          </div>
          <button type="submit" className="btn-primary">Criar</button>
        </form>

        <div className="picker-list" style={{ marginTop: '1.5rem' }}>
          {aulas.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nenhuma aula ainda nesta turma.</p>}
          {aulas.map((a) => (
            <button key={a.id} className="picker-item" onClick={() => setAulaSelecionada(a)}>
              <span>
                {a.titulo} — <span style={{ color: 'var(--text-muted)' }}>{a.status}</span>
              </span>
              <span className="codigo">{a.codigo_aula}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div className="breadcrumb-bar">
        <button onClick={() => setAulaSelecionada(null)}>← Aulas</button>
        <span>
          / {turmaSelecionada.nome} / {aulaSelecionada.titulo}
        </span>
      </div>

      {erro && <p className="error-text">{erro}</p>}

      <div className="sub-tabs">
        <button className={aba === 'controle' ? 'active' : ''} onClick={() => setAba('controle')}>
          Controle da Aula
        </button>
        <button className={aba === 'atividade' ? 'active' : ''} onClick={() => setAba('atividade')}>
          Disparar Atividade
        </button>
        <button className={aba === 'quizzes' ? 'active' : ''} onClick={() => setAba('quizzes')}>
          Banco de Quizzes
        </button>
      </div>

      {aba === 'controle' && (
        <div>
          <p>
            Código da aula pro aluno digitar: <span className="aula-codigo-display" style={{ display: 'inline-block' }}>{aulaSelecionada.codigo_aula}</span>
          </p>
          <p style={{ color: 'var(--text-muted)' }}>Status: {aulaSelecionada.status}</p>

          <div className="modo-toggle-row" style={{ margin: '1rem 0' }}>
            <button className={aulaSelecionada.modo_atual === 'livre' ? 'active' : ''} onClick={() => handleModo('livre')}>
              Modo Livre
            </button>
            <button className={aulaSelecionada.modo_atual === 'foco' ? 'active' : ''} onClick={() => handleModo('foco')}>
              🎯 Modo Foco
            </button>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            O Modo Atividade é ativado automaticamente ao disparar um quiz na aba "Disparar Atividade".
          </p>

          {aulaSelecionada.status !== 'encerrada' && (
            <button className="btn-ghost" onClick={handleEncerrarAula}>
              Encerrar aula
            </button>
          )}
        </div>
      )}

      {aba === 'atividade' && (
        <TeacherGameDashboard
          aulaId={aulaSelecionada.id}
          activePartidaId={activePartidaId}
          onPartidaCriada={(id) => setActivePartidaId(id)}
        />
      )}

      {aba === 'quizzes' && (
        <TeacherQuizManager
          onIniciarPartidaComQuiz={() => {
            setAba('atividade')
          }}
        />
      )}
    </div>
  )
}
