import { useState } from 'react'
import AlunoApp from './components/AlunoApp'
import LoginScreen from './components/LoginScreen'
import ProfessorApp from './components/ProfessorApp'
import { clearAuth, getRole, getToken } from './services/api'
import { useIsMobile } from './hooks/useIsMobile'

export default function App() {
  const isMobile = useIsMobile()
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [role, setRole] = useState<'professor' | 'aluno'>(() => {
    const savedRole = getRole()
    if (savedRole === 'professor' || savedRole === 'aluno') return savedRole
    return isMobile ? 'aluno' : 'professor'
  })

  const logado = !!token

  function handleLogado(novaRole: 'professor' | 'aluno') {
    setTokenState(getToken())
    setRole(novaRole)
  }

  function handleSair() {
    clearAuth()
    setTokenState(null)
  }

  return (
    <div className="app-root">
      <header className="app-navbar">
        <div className="brand-section">
          <img src="/favicon.svg" alt="ClassPulse" className="brand-icon" />
          <span className="brand-title">ClassPulse</span>
          {logado && (
            <span className="role-badge">
              {role === 'professor' ? '👨‍🏫 Professor' : '🎓 Aluno'}
            </span>
          )}
        </div>
        {logado && (
          <button className="btn-logout" onClick={handleSair} title="Sair da conta">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sair</span>
          </button>
        )}
      </header>

      <main className="app-container">
        {!logado ? (
          <LoginScreen initialRole={role} onLogado={handleLogado} />
        ) : role === 'professor' ? (
          <ProfessorApp />
        ) : (
          <AlunoApp />
        )}
      </main>
    </div>
  )
}

