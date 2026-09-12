import { useState } from 'react'
import AlunoApp from './components/AlunoApp'
import LoginScreen from './components/LoginScreen'
import ProfessorApp from './components/ProfessorApp'
import { clearAuth, getRole, getToken } from './services/api'
import { useIsMobile } from './hooks/useIsMobile'

export default function App() {
  const isMobile = useIsMobile()
  const role = isMobile ? 'aluno' : 'professor'

  const [logado, setLogado] = useState(() => !!getToken() && getRole() === role)

  function handleSair() {
    clearAuth()
    setLogado(false)
  }

  return (
    <div className="app-root">
      <header className="app-navbar">
        <div className="brand-section">
          <img src="/favicon.svg" alt="ClassPulse" className="brand-icon" />
          <span className="brand-title">ClassPulse</span>
        </div>
        {logado && (
          <button className="btn-ghost" onClick={handleSair}>
            Sair
          </button>
        )}
      </header>

      <main className="app-container">
        {!logado ? (
          <LoginScreen role={role} onLogado={() => setLogado(true)} />
        ) : role === 'professor' ? (
          <ProfessorApp />
        ) : (
          <AlunoApp />
        )}
      </main>
    </div>
  )
}
