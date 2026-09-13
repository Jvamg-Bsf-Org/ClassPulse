import { useState } from 'react'
import {
  cadastrarAluno,
  cadastrarProfessor,
  loginAluno,
  loginProfessor,
  setToken,
} from '../services/api'


interface Props {
  initialRole?: 'professor' | 'aluno'
  onLogado: (role: 'professor' | 'aluno') => void
}

export default function LoginScreen({ initialRole = 'professor', onLogado }: Props) {
  const [role, setRole] = useState<'professor' | 'aluno'>(initialRole)
  const [modo, setModo] = useState<'login' | 'cadastro'>('login')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  function handleRoleChange(newRole: 'professor' | 'aluno') {
    setRole(newRole)
    setErro(null)
  }

  function handleModoChange(newModo: 'login' | 'cadastro') {
    setModo(newModo)
    setErro(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const resp =
        modo === 'login'
          ? role === 'professor'
            ? await loginProfessor(email.trim(), senha)
            : await loginAluno(email.trim(), senha)
          : role === 'professor'
            ? await cadastrarProfessor(nome.trim(), email.trim(), senha)
            : await cadastrarAluno(nome.trim(), email.trim(), senha)
      setToken(resp.access_token, resp.tipo)
      onLogado(resp.tipo)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="centered-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-role-selector">
          <button
            type="button"
            className={`auth-role-btn ${role === 'professor' ? 'active' : ''}`}
            onClick={() => handleRoleChange('professor')}
          >
            <span className="role-btn-icon">👨‍🏫</span>
            <span className="role-btn-label">Professor</span>
          </button>
          <button
            type="button"
            className={`auth-role-btn ${role === 'aluno' ? 'active' : ''}`}
            onClick={() => handleRoleChange('aluno')}
          >
            <span className="role-btn-icon">🎓</span>
            <span className="role-btn-label">Aluno</span>
          </button>
        </div>

        <div className="auth-header">
          <h1>{role === 'professor' ? 'Área do Professor' : 'Área do Aluno'}</h1>
          <p className="auth-subtitle">
            {role === 'professor'
              ? 'Gerencie turmas, crie quizzes e acompanhe o engajamento.'
              : 'Participe de aulas interativas, quizzes e acompanhe seu foco.'}
          </p>
        </div>

        <div className="auth-toggle">
          <button
            type="button"
            className={modo === 'login' ? 'active' : ''}
            onClick={() => handleModoChange('login')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={modo === 'cadastro' ? 'active' : ''}
            onClick={() => handleModoChange('cadastro')}
          >
            Criar conta
          </button>
        </div>

        {modo === 'cadastro' && (
          <div className="form-group">
            <label htmlFor="nome">Nome completo</label>
            <input
              id="nome"
              placeholder={role === 'professor' ? 'Ex: Profa. Maria Silva' : 'Ex: Carlos Eduardo'}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder={role === 'professor' ? 'professor@escola.com' : 'aluno@escola.com'}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            placeholder="••••••••"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </div>

        {erro && <p className="error-text">{erro}</p>}

        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando
            ? 'Processando...'
            : modo === 'login'
              ? `Entrar como ${role === 'professor' ? 'Professor' : 'Aluno'}`
              : `Cadastrar como ${role === 'professor' ? 'Professor' : 'Aluno'}`}
        </button>
      </form>
    </div>
  )
}
