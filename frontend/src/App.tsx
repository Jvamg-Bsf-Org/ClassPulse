import { useState } from 'react'
import StudentGameView from './components/StudentGameView'
import TeacherGameDashboard from './components/TeacherGameDashboard'
import TeacherQuizManager from './components/TeacherQuizManager'
import type { PartidaAlunoStatus } from './types/game'


type ViewMode = 'aluno' | 'professor_painel' | 'professor_quizzes'

// Exemplo interativo de dados para teste e demonstração imediata
const DEMO_STATUS_GRUPO: PartidaAlunoStatus = {
  id: 1,
  aula_id: 1,
  quiz_titulo: 'Quiz Rápido: Física e Cinemática',
  status: 'em_andamento',
  modo_execucao: 'grupo',
  competitivo: false,
  obrigatorio: true,
  meta_coletiva_percentual: 80,
  iniciada_em: new Date().toISOString(),
  segundos_discussao_restantes: 60,
  segundos_totais_restantes: 300,
  pode_enviar_resposta: false,
  pulou: false,
  grupo: {
    id: 1,
    nome_ou_numero: 'Equipe Alpha',
    membros: ['Você (João)', 'Lucas Silva'],
  },
  perguntas: [
    {
      id: 101,
      enunciado: 'Qual é a unidade padrão de velocidade no Sistema Internacional (SI)?',
      tipo: 'multipla_escolha',
      ordem: 0,
      pontos: 100,
      alternativas: [
        { id: 1, texto: 'km/h (quilômetros por hora)' },
        { id: 2, texto: 'm/s (metros por segundo)' },
        { id: 3, texto: 'mph (milhas por hora)' },
        { id: 4, texto: 'cm/s (centímetros por segundo)' },
      ],
    },
    {
      id: 102,
      enunciado: 'Em um Movimento Retilíneo Uniforme (MRU), a aceleração é diferente de zero.',
      tipo: 'verdadeiro_falso',
      ordem: 1,
      pontos: 100,
      alternativas: [
        { id: 5, texto: 'Verdadeiro' },
        { id: 6, texto: 'Falso' },
      ],
    },
  ],
  respostas_enviadas: {},
}

export default function App() {
  const [view, setView] = useState<ViewMode>('aluno')
  const [simuladoStatus, setSimuladoStatus] = useState<PartidaAlunoStatus>(DEMO_STATUS_GRUPO)
  const [activePartidaId, setActivePartidaId] = useState<number | null>(1)

  return (
    <div className="app-root">
      {/* Barra de Navegação Superior */}
      <header className="app-navbar">
        <div className="brand-section">
          <span className="brand-icon">⚡</span>
          <span className="brand-title">ClassPulse</span>
        </div>

        <nav className="nav-tabs">
          <button
            className={`nav-tab-btn ${view === 'aluno' ? 'active' : ''}`}
            onClick={() => setView('aluno')}
          >
            📱 Celular do Aluno (PWA)
          </button>
          <button
            className={`nav-tab-btn ${view === 'professor_painel' ? 'active' : ''}`}
            onClick={() => setView('professor_painel')}
          >
            🖥️ Painel da Aula ao Vivo
          </button>
          <button
            className={`nav-tab-btn ${view === 'professor_quizzes' ? 'active' : ''}`}
            onClick={() => setView('professor_quizzes')}
          >
            📚 Banco de Quizzes
          </button>
        </nav>
      </header>

      {/* Conteúdo Principal da Aplicação */}
      <main className="app-container">
        {view === 'aluno' && (
          <div className="mobile-simulator-wrapper">
            <div className="simulator-header-notice">
              Simulador da tela do smartphone do aluno (PWA Leve)
            </div>
            <div className="mobile-phone-frame">
              <StudentGameView
                status={simuladoStatus}
                onAtualizarStatus={() => {
                  // toggle de teste
                  setSimuladoStatus((prev) => ({ ...prev }))
                }}
              />
            </div>
          </div>
        )}

        {view === 'professor_painel' && (
          <TeacherGameDashboard
            aulaId={1}
            activePartidaId={activePartidaId}
            onPartidaCriada={(id) => setActivePartidaId(id)}
          />
        )}

        {view === 'professor_quizzes' && (
          <TeacherQuizManager
            onIniciarPartidaComQuiz={(quizId) => {
              setActivePartidaId(quizId)
              setView('professor_painel')
            }}
          />
        )}
      </main>
    </div>
  )
}
