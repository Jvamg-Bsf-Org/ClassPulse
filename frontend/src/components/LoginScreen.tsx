import { useState } from 'react'
import {
  cadastrarAluno,
  cadastrarProfessor,
  loginAluno,
  loginProfessor,
  setToken,
} from '../services/api'
import { solicitarPermissaoSensores } from '../focus/sensors'

interface Props {
  role: 'professor' | 'aluno'
  onLogado: () => void
}

export default function LoginScreen({ role, onLogado }: Props) {
  const [modo, setModo] = useState<'login' | 'cadastro'>('login')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)

    if (role === 'aluno') {
      // Disparado aqui de propósito: é o toque do usuário, precisa ser síncrono
      // com o clique (principalmente no iOS). Não bloqueia o login nem aparece
      // pro aluno — é só uma tentativa antecipada; a checagem que decide de
      // verdade acontece de novo (e é obrigatória) na hora de entrar na aula.
      solicitarPermissaoSensores().catch(() => {})
    }

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
      onLogado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="centered-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>{role === 'professor' ? 'Área do Professor' : 'Área do Aluno'}</h1>

        <div className="auth-toggle">
          <button type="button" className={modo === 'login' ? 'active' : ''} onClick={() => setModo('login')}>
            Entrar
          </button>
          <button
            type="button"
            className={modo === 'cadastro' ? 'active' : ''}
            onClick={() => setModo('cadastro')}
          >
            Criar conta
          </button>
        </div>

        {modo === 'cadastro' && (
          <div className="form-group">
            <label htmlFor="nome">Nome</label>
            <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className="form-group">
          <label htmlFor="senha">Senha</label>
          <input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>

        {erro && <p className="error-text">{erro}</p>}

        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? 'Enviando...' : modo === 'login' ? 'Entrar' : 'Cadastrar'}
        </button>
      </form>
    </div>
  )
}
