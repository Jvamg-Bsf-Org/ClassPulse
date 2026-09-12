import { useEffect, useRef, useState } from 'react'
import {
  conectarWebSocketAula,
  entrarAula,
  entrarTurma,
  obterStatusAluno,
  reportarFoco,
  type Aula,
} from '../services/api'
import type { PartidaAlunoStatus } from '../types/game'
import { FocusSession, type ResumoFocoSessao } from '../focus/focusSession'
import { iniciarSessaoDeFoco, solicitarPermissaoSensores, type SessaoAtiva } from '../focus/sensors'
import StudentGameView from './StudentGameView'

export default function AlunoApp() {
  const [aula, setAula] = useState<Aula | null>(null)
  const [codigoAula, setCodigoAula] = useState('')
  const [precisaDeTurma, setPrecisaDeTurma] = useState(false)
  const [codigoTurma, setCodigoTurma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [resumoFoco, setResumoFoco] = useState<ResumoFocoSessao | null>(null)
  const [partida, setPartida] = useState<PartidaAlunoStatus | null>(null)

  const sessaoRef = useRef<SessaoAtiva | null>(null)
  const focusSessionRef = useRef<FocusSession | null>(null)

  function pararSessaoDeFoco() {
    sessaoRef.current?.parar()
    sessaoRef.current = null
    focusSessionRef.current = null
    setResumoFoco(null)
  }

  function iniciarFoco() {
    pararSessaoDeFoco()
    const ativa = iniciarSessaoDeFoco()
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

  async function handleEntrarAula(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      // Gate: sem confirmar sensor de verdade, nem tenta entrar. É proposital
      // não explicar o motivo técnico pro aluno -- só uma mensagem genérica.
      const sensorOk = await solicitarPermissaoSensores()
      if (!sensorOk) {
        setErro(
          'Não conseguimos ativar o app neste navegador. Tente pelo Chrome ou Safari mais recente, sem bloqueadores ativos.'
        )
        setEnviando(false)
        return
      }

      const a = await entrarAula(codigoAula.trim())
      setAula(a)
      if (a.modo_atual === 'foco') iniciarFoco()
      if (a.modo_atual === 'atividade') carregarPartida(a.id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao entrar na aula'
      setErro(msg)
      if (msg.toLowerCase().includes('matriculado')) setPrecisaDeTurma(true)
    } finally {
      setEnviando(false)
    }
  }

  async function handleEntrarTurma(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await entrarTurma(codigoTurma.trim())
      setPrecisaDeTurma(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao entrar na turma')
    } finally {
      setEnviando(false)
    }
  }

  // WebSocket da aula: reage a mudança de modo e eventos de partida
  useEffect(() => {
    if (!aula) return

    const ws = conectarWebSocketAula(aula.id, (msg) => {
      if (msg.evento === 'modo_mudou') {
        // Troca manual do professor (Livre/Foco) — sai da atividade, se tinha uma.
        setAula((prev) => (prev ? { ...prev, modo_atual: msg.modo } : prev))
        setPartida(null)
        if (msg.modo === 'foco') {
          iniciarFoco()
        } else {
          pararSessaoDeFoco()
        }
      }
      if (msg.evento === 'partida_iniciada') {
        // O backend já muda aula.modo_atual pra 'atividade' ao disparar a partida,
        // mas isso vem dentro do evento partida_iniciada (não modo_mudou) — replica aqui.
        pararSessaoDeFoco()
        setAula((prev) => (prev ? { ...prev, modo_atual: 'atividade' } : prev))
        carregarPartida(aula.id)
      }
      if (msg.evento === 'resposta_registrada') {
        carregarPartida(aula.id)
      }
      if (msg.evento === 'partida_encerrada') {
        // Não mexe em `partida` nem no modo aqui: deixa a StudentGameView montada,
        // pra o aluno ainda conseguir clicar em "Ver Gabarito & Resultados". Ela some
        // só quando o professor mandar um modo_mudou de verdade (próxima etapa da aula).
      }
      if (msg.evento === 'aula_encerrada') {
        pararSessaoDeFoco()
        setAula((prev) => (prev ? { ...prev, status: 'encerrada' } : prev))
      }
    })

    return () => {
      ws.close()
      pararSessaoDeFoco()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aula?.id])

  // Reporta o score de foco pro backend periodicamente enquanto o sensor está ativo
  useEffect(() => {
    if (!aula) return
    const intervalo = setInterval(() => {
      const sessao = focusSessionRef.current
      if (!sessao) return
      const r = sessao.resumo()
      setResumoFoco(r)
      reportarFoco(aula.id, r.focoSegundos).catch(() => {})
    }, 4000)
    return () => clearInterval(intervalo)
  }, [aula?.id])

  if (!aula) {
    return (
      <div className="centered-screen">
        <form className="auth-card" onSubmit={precisaDeTurma ? handleEntrarTurma : handleEntrarAula}>
          <h1>{precisaDeTurma ? 'Entrar na turma' : 'Entrar na aula'}</h1>
          {precisaDeTurma ? (
            <div className="form-group">
              <label htmlFor="codigo-turma">Código da turma</label>
              <input
                id="codigo-turma"
                value={codigoTurma}
                onChange={(e) => setCodigoTurma(e.target.value)}
                required
                autoFocus
              />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
                Seu professor passa esse código uma vez, no início do curso.
              </p>
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="codigo-aula">Código da aula de hoje</label>
              <input
                id="codigo-aula"
                value={codigoAula}
                onChange={(e) => setCodigoAula(e.target.value)}
                required
                autoFocus
              />
            </div>
          )}
          {erro && <p className="error-text">{erro}</p>}
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setPrecisaDeTurma((v) => !v)}>
            {precisaDeTurma ? 'Já tenho o código da turma? Voltar' : 'Ainda não estou matriculado numa turma'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 480, margin: '0 auto' }}>
      {aula.status === 'encerrada' ? (
        <div className="waiting-card">
          <h2>Aula encerrada</h2>
          <p>O professor encerrou a aula. Obrigado pela participação!</p>
        </div>
      ) : partida ? (
        <StudentGameView status={partida} onAtualizarStatus={() => carregarPartida(aula.id)} />
      ) : aula.modo_atual === 'livre' ? (
        <div className="waiting-card">
          <h2>Aula em andamento</h2>
          <p>Aguarde as instruções do professor.</p>
        </div>
      ) : aula.modo_atual === 'foco' ? (
        <div className="waiting-card">
          <div className="foco-banner">
            📱 Vire seu celular com a tela pra baixo, ou deixe ele parado sem mexer.
          </div>
          {resumoFoco && (
            <ul className="foco-status-list">
              <li>Estado: {resumoFoco.estadoAtual}</li>
              <li>Foco acumulado: {resumoFoco.focoSegundos}s</li>
              <li>Distração: {resumoFoco.distracaoSegundos}s</li>
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
