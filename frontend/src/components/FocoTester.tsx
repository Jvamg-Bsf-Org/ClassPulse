import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  cadastrarAluno,
  cadastrarProfessor,
  clearAuth,
  conectarWebSocketAula,
  criarAula,
  criarTurma,
  encerrarAula,
  entrarAula,
  entrarTurma,
  getRole,
  getToken,
  loginAluno,
  loginProfessor,
  minhasTurmas,
  mudarModoAula,
  reportarFoco,
  setToken,
  type Aula,
  type Turma,
} from '../services/api'
import { FocusSession, type ResumoFocoSessao } from '../focus/focusSession'
import { iniciarSessaoDeFoco, sensoresSuportados, solicitarPermissaoSensores, type SessaoAtiva } from '../focus/sensors'

// Componente único, sem estilo bonito de propósito — é uma bancada de teste pra
// validar o fluxo Turma -> Aula -> Modo Foco -> sensor -> score, não a UI final.

const box: CSSProperties = { border: '1px solid #ccc', borderRadius: 8, padding: '1rem', margin: '0.75rem 0' }
const btn: CSSProperties = { padding: '0.4rem 0.8rem', marginRight: '0.5rem', cursor: 'pointer' }
const input: CSSProperties = { padding: '0.3rem', marginRight: '0.5rem' }

export default function FocoTester() {
  const [logado, setLogado] = useState(!!getToken())
  const [role, setRole] = useState<'professor' | 'aluno'>((getRole() as 'professor' | 'aluno') || 'aluno')

  if (!logado) {
    return <AuthForm onLogado={(r) => { setRole(r); setLogado(true) }} />
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Bancada de teste — Modo Foco ({role})</h2>
        <button
          style={btn}
          onClick={() => {
            clearAuth()
            setLogado(false)
          }}
        >
          Sair
        </button>
      </div>
      {role === 'professor' ? <PainelProfessor /> : <PainelAluno />}
    </div>
  )
}

function AuthForm({ onLogado }: { onLogado: (role: 'professor' | 'aluno') => void }) {
  const [role, setRole] = useState<'professor' | 'aluno'>('aluno')
  const [modo, setModo] = useState<'login' | 'cadastro'>('login')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function enviar() {
    setErro(null)
    try {
      const resp =
        modo === 'login'
          ? role === 'professor'
            ? await loginProfessor(email, senha)
            : await loginAluno(email, senha)
          : role === 'professor'
            ? await cadastrarProfessor(nome, email, senha)
            : await cadastrarAluno(nome, email, senha)
      setToken(resp.access_token, resp.tipo)
      onLogado(resp.tipo)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido')
    }
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 420 }}>
      <h2>Bancada de teste — Modo Foco</h2>
      <div style={box}>
        <label>
          <input type="radio" checked={role === 'aluno'} onChange={() => setRole('aluno')} /> Aluno
        </label>{' '}
        <label>
          <input type="radio" checked={role === 'professor'} onChange={() => setRole('professor')} /> Professor
        </label>
        <br />
        <label>
          <input type="radio" checked={modo === 'login'} onChange={() => setModo('login')} /> Login
        </label>{' '}
        <label>
          <input type="radio" checked={modo === 'cadastro'} onChange={() => setModo('cadastro')} /> Cadastro
        </label>

        {modo === 'cadastro' && (
          <div style={{ marginTop: '0.5rem' }}>
            <input style={input} placeholder="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
        )}
        <div style={{ marginTop: '0.5rem' }}>
          <input style={input} placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            style={input}
            placeholder="senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>
        <button style={{ ...btn, marginTop: '0.5rem' }} onClick={enviar}>
          {modo === 'login' ? 'Entrar' : 'Cadastrar'}
        </button>
        {erro && <p style={{ color: 'crimson' }}>{erro}</p>}
      </div>
    </div>
  )
}

function PainelProfessor() {
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [nomeTurma, setNomeTurma] = useState('')
  const [turmaSelecionada, setTurmaSelecionada] = useState<Turma | null>(null)
  const [tituloAula, setTituloAula] = useState('')
  const [aula, setAula] = useState<Aula | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function carregarTurmas() {
    try {
      setTurmas(await minhasTurmas())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    carregarTurmas()
  }, [])

  async function handleCriarTurma() {
    setErro(null)
    try {
      const t = await criarTurma(nomeTurma)
      setNomeTurma('')
      await carregarTurmas()
      setTurmaSelecionada(t)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleCriarAula() {
    if (!turmaSelecionada) return
    setErro(null)
    try {
      const a = await criarAula(turmaSelecionada.id, tituloAula || 'Aula de teste')
      setAula(a)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleModo(modo: Aula['modo_atual']) {
    if (!aula) return
    setErro(null)
    try {
      setAula(await mudarModoAula(aula.id, modo))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleEncerrar() {
    if (!aula) return
    setAula(await encerrarAula(aula.id))
  }

  return (
    <div>
      {erro && <p style={{ color: 'crimson' }}>{erro}</p>}

      <div style={box}>
        <h3>1. Turma</h3>
        <input style={input} placeholder="nome da turma" value={nomeTurma} onChange={(e) => setNomeTurma(e.target.value)} />
        <button style={btn} onClick={handleCriarTurma}>
          Criar turma
        </button>
        <ul>
          {turmas.map((t) => (
            <li key={t.id}>
              <button style={btn} onClick={() => setTurmaSelecionada(t)}>
                {turmaSelecionada?.id === t.id ? '✓ ' : ''}
                {t.nome} — código <strong>{t.codigo_turma}</strong>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {turmaSelecionada && (
        <div style={box}>
          <h3>2. Aula (dentro de "{turmaSelecionada.nome}")</h3>
          <input
            style={input}
            placeholder="título da aula"
            value={tituloAula}
            onChange={(e) => setTituloAula(e.target.value)}
          />
          <button style={btn} onClick={handleCriarAula}>
            Criar aula
          </button>
        </div>
      )}

      {aula && (
        <div style={box}>
          <h3>3. Controle da aula</h3>
          <p>
            Código da aula pro aluno digitar: <strong style={{ fontSize: '1.3rem' }}>{aula.codigo_aula}</strong>
          </p>
          <p>
            Modo atual: <strong>{aula.modo_atual}</strong> — Status: {aula.status}
          </p>
          <button style={btn} onClick={() => handleModo('livre')}>
            Modo Livre
          </button>
          <button style={btn} onClick={() => handleModo('foco')}>
            🎯 Ativar Modo Foco
          </button>
          <button style={btn} onClick={() => handleModo('atividade')}>
            Modo Atividade
          </button>
          <button style={{ ...btn, marginTop: '0.5rem' }} onClick={handleEncerrar}>
            Encerrar aula
          </button>
        </div>
      )}
    </div>
  )
}

function PainelAluno() {
  const [codigoTurma, setCodigoTurma] = useState('')
  const [codigoAula, setCodigoAula] = useState('')
  const [aula, setAula] = useState<Aula | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [permissaoSensor, setPermissaoSensor] = useState<'nao_pedida' | 'concedida' | 'negada'>('nao_pedida')
  const [resumo, setResumo] = useState<ResumoFocoSessao | null>(null)

  const sessaoRef = useRef<SessaoAtiva | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const focusSessionRef = useRef<FocusSession | null>(null)

  async function handleEntrarTurma() {
    setErro(null)
    try {
      await entrarTurma(codigoTurma)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleAtivarSensores() {
    const ok = await solicitarPermissaoSensores()
    setPermissaoSensor(ok ? 'concedida' : 'negada')
  }

  function pararSessaoDeFoco() {
    sessaoRef.current?.parar()
    sessaoRef.current = null
    focusSessionRef.current = null
  }

  function iniciarFoco() {
    pararSessaoDeFoco()
    const ativa = iniciarSessaoDeFoco({
      sensoresDisponiveis: permissaoSensor === 'concedida',
      onProtegidoChange: (protegido, motivo) => {
        console.log('[foco] protegido:', protegido, motivo)
      },
    })
    sessaoRef.current = ativa
    focusSessionRef.current = ativa.sessao
  }

  useEffect(() => {
    if (!aula) return

    const ws = conectarWebSocketAula(aula.id, (msg) => {
      if (msg.evento === 'modo_mudou') {
        setAula((prev) => (prev ? { ...prev, modo_atual: msg.modo } : prev))
        if (msg.modo === 'foco') {
          iniciarFoco()
        } else {
          pararSessaoDeFoco()
        }
      }
      if (msg.evento === 'aula_encerrada') {
        pararSessaoDeFoco()
      }
    })
    wsRef.current = ws

    return () => {
      ws.close()
      pararSessaoDeFoco()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aula?.id])

  // poll local (mostra na tela) + manda pro backend periodicamente
  useEffect(() => {
    if (!aula) return
    const intervalo = setInterval(() => {
      const sessao = focusSessionRef.current
      if (!sessao) return
      const r = sessao.resumo()
      setResumo(r)
      reportarFoco(aula.id, r.focoSegundos).catch(() => {
        /* silencioso -- é só telemetria de teste */
      })
    }, 3000)
    return () => clearInterval(intervalo)
  }, [aula?.id])

  async function handleEntrarAula() {
    setErro(null)
    try {
      const a = await entrarAula(codigoAula)
      setAula(a)
      if (a.modo_atual === 'foco') iniciarFoco()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      {erro && <p style={{ color: 'crimson' }}>{erro}</p>}

      <div style={box}>
        <h3>1. Entrar na turma (uma vez só)</h3>
        <input style={input} placeholder="código da turma" value={codigoTurma} onChange={(e) => setCodigoTurma(e.target.value)} />
        <button style={btn} onClick={handleEntrarTurma}>
          Entrar
        </button>
      </div>

      <div style={box}>
        <h3>2. Ativar sensores (uma vez por dispositivo)</h3>
        <p>Suporte no navegador: {sensoresSuportados() ? 'sim' : 'não'}</p>
        <button style={btn} onClick={handleAtivarSensores}>
          Ativar sensores
        </button>
        <p>Status: {permissaoSensor}</p>
      </div>

      <div style={box}>
        <h3>3. Entrar na aula</h3>
        <input style={input} placeholder="código da aula" value={codigoAula} onChange={(e) => setCodigoAula(e.target.value)} />
        <button style={btn} onClick={handleEntrarAula}>
          Entrar
        </button>
      </div>

      {aula && (
        <div style={box}>
          <h3>4. Status ao vivo</h3>
          <p>
            Modo da aula: <strong>{aula.modo_atual}</strong>
          </p>
          {aula.modo_atual === 'foco' && (
            <p style={{ background: '#fef3c7', padding: '0.5rem' }}>
              📱 Vire o celular com a tela pra baixo, ou deixe ele parado, sem mexer.
            </p>
          )}
          {resumo && (
            <ul>
              <li>Estado: {resumo.estadoAtual}</li>
              <li>Motivo protegido: {resumo.motivoProtegido ?? '-'}</li>
              <li>Foco: {resumo.focoSegundos}s</li>
              <li>Distração: {resumo.distracaoSegundos}s</li>
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
