import { useEffect, useState } from 'react'
import type { ModoExecucaoQuiz, PerguntaCompleta, QuizResumo } from '../types/game'

import { criarQuiz, deletarQuiz, listarQuizzes } from '../services/api'

interface Props {
  onIniciarPartidaComQuiz?: (quizId: number) => void
}

export default function TeacherQuizManager({ onIniciarPartidaComQuiz }: Props) {
  const [quizzes, setQuizzes] = useState<QuizResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [criando, setCriando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // Form states
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [modoExecucao, setModoExecucao] = useState<ModoExecucaoQuiz>('individual')
  const [competitivo, setCompetitivo] = useState(false)
  const [obrigatorio, setObrigatorio] = useState(true)
  const [metaColetiva, setMetaColetiva] = useState(80)

  const [perguntas, setPerguntas] = useState<PerguntaCompleta[]>([
    {
      enunciado: '',
      tipo: 'multipla_escolha',
      ordem: 0,
      pontos: 100,
      explicacao: '',
      alternativas: [
        { texto: '', correta: true },
        { texto: '', correta: false },
      ],
    },
  ])

  async function carregar() {
    setCarregando(true)
    try {
      const data = await listarQuizzes()
      setQuizzes(data)
    } catch (err: any) {
      console.error(err)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  function handleAddPergunta() {
    setPerguntas((prev) => [
      ...prev,
      {
        enunciado: '',
        tipo: 'multipla_escolha',
        ordem: prev.length,
        pontos: 100,
        explicacao: '',
        alternativas: [
          { texto: '', correta: true },
          { texto: '', correta: false },
        ],
      },
    ])
  }

  function handleRemovePergunta(index: number) {
    if (perguntas.length <= 1) return
    setPerguntas((prev) => prev.filter((_, i) => i !== index))
  }

  function handleAddAlternativa(qIndex: number) {
    setPerguntas((prev) => {
      const copy = [...prev]
      copy[qIndex].alternativas.push({ texto: '', correta: false })
      return copy
    })
  }

  function handleSetCorreta(qIndex: number, altIndex: number) {
    setPerguntas((prev) => {
      const copy = [...prev]
      copy[qIndex].alternativas = copy[qIndex].alternativas.map((alt, i) => ({
        ...alt,
        correta: i === altIndex,
      }))
      return copy
    })
  }

  async function handleSalvarQuiz(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) {
      alert('Preencha o título do quiz')
      return
    }

    // Validar perguntas
    for (let i = 0; i < perguntas.length; i++) {
      const p = perguntas[i]
      if (!p.enunciado.trim()) {
        alert(`Preencha o enunciado da Questão ${i + 1}`)
        return
      }
      const temCorreta = p.alternativas.some((a) => a.correta)
      if (!temCorreta) {
        alert(`Defina a alternativa correta na Questão ${i + 1}`)
        return
      }
      for (const alt of p.alternativas) {
        if (!alt.texto.trim()) {
          alert(`Preencha o texto de todas as alternativas da Questão ${i + 1}`)
          return
        }
      }
    }

    setSalvando(true)
    try {
      await criarQuiz({
        titulo,
        descricao,
        modo_execucao: modoExecucao,
        competitivo,
        obrigatorio,
        meta_coletiva_percentual: competitivo ? undefined : metaColetiva,
        perguntas,
      })
      alert('Quiz salvo com sucesso no seu banco de questões!')
      setCriando(false)
      // reset form
      setTitulo('')
      setDescricao('')
      carregar()
    } catch (err: any) {
      alert(`Erro: ${err.message}`)
    } finally {
      setSalvando(false)
    }
  }

  async function handleDeletar(id: number) {
    if (!confirm('Deseja excluir este quiz?')) return
    try {
      await deletarQuiz(id)
      carregar()
    } catch (err: any) {
      alert(err.message)
    }
  }

  return (
    <div className="teacher-quiz-manager pulse-fade-in">
      <div className="section-header">
        <div>
          <h2>Banco de Quizzes do Professor</h2>
          <p className="subtitle">
            Crie quizzes uma vez e reutilize em qualquer aula ou turma.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCriando(!criando)}>
          {criando ? '✕ Cancelar' : '＋ Novo Quiz'}
        </button>
      </div>

      {/* Formulário de Criação de Quiz */}
      {criando && (
        <form className="quiz-create-form" onSubmit={handleSalvarQuiz}>
          <h3>Cadastrar Novo Quiz</h3>

          <div className="form-group">
            <label htmlFor="quiz-titulo">Título do Quiz *</label>
            <input
              id="quiz-titulo"
              type="text"
              placeholder="Ex: Fixação - Leis de Newton"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="quiz-descricao">Descrição pedagógica (opcional)</label>
            <textarea
              id="quiz-descricao"
              placeholder="Ex: Exercícios rápidos pós-explicação teórica de inércia e força."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
            />
          </div>

          <div className="toggles-grid">
            <div className="toggle-box">
              <label htmlFor="quiz-formato">Formato Padrão:</label>
              <select
                id="quiz-formato"
                value={modoExecucao}
                onChange={(e) => setModoExecucao(e.target.value as ModoExecucaoQuiz)}
              >
                <option value="individual">Individual</option>
                <option value="grupo">Em Equipes (com 60s de debate)</option>
              </select>
            </div>

            <div className="toggle-box">
              <label htmlFor="quiz-estilo">Estilo do Jogo:</label>
              <select
                id="quiz-estilo"
                value={competitivo ? 'comp' : 'coop'}
                onChange={(e) => setCompetitivo(e.target.value === 'comp')}
              >
                <option value="coop">🤝 Cooperativo (Meta da Sala)</option>
                <option value="comp">🏆 Competitivo (Ranking)</option>
              </select>
            </div>

            {!competitivo && (
              <div className="toggle-box">
                <label htmlFor="quiz-meta">Meta Coletiva (% acertos):</label>
                <input
                  id="quiz-meta"
                  type="number"
                  min="10"
                  max="100"
                  value={metaColetiva}
                  onChange={(e) => setMetaColetiva(Number(e.target.value))}
                />
              </div>
            )}

            <div className="toggle-box">
              <label htmlFor="quiz-participacao">Participação:</label>
              <select
                id="quiz-participacao"
                value={obrigatorio ? 'obrig' : 'opc'}
                onChange={(e) => setObrigatorio(e.target.value === 'obrig')}
              >
                <option value="obrig">Obrigatório</option>
                <option value="opc">Opcional (aluno pode pular)</option>
              </select>
            </div>
          </div>

          {/* Perguntas */}
          <div className="form-questions-section">
            <h4>Questões do Quiz ({perguntas.length})</h4>

            {perguntas.map((p, qIdx) => (
              <div key={qIdx} className="question-edit-card">
                <div className="q-edit-header">
                  <strong>Questão #{qIdx + 1}</strong>
                  {perguntas.length > 1 && (
                    <button
                      type="button"
                      className="btn-danger-link"
                      onClick={() => handleRemovePergunta(qIdx)}
                    >
                      Remover Questão
                    </button>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor={`enunciado-${qIdx}`}>Enunciado da Questão *</label>
                  <input
                    id={`enunciado-${qIdx}`}
                    type="text"
                    placeholder="Digite a pergunta para a turma..."
                    value={p.enunciado}
                    onChange={(e) => {
                      const copy = [...perguntas]
                      copy[qIdx].enunciado = e.target.value
                      setPerguntas(copy)
                    }}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor={`explicacao-${qIdx}`}>Explicação Pedagógica (revelada após o encerramento da atividade)</label>
                  <input
                    id={`explicacao-${qIdx}`}
                    type="text"
                    placeholder="Ex: Lembrar que a força resultante é o produto da massa pela aceleração..."
                    value={p.explicacao || ''}
                    onChange={(e) => {
                      const copy = [...perguntas]
                      copy[qIdx].explicacao = e.target.value
                      setPerguntas(copy)
                    }}
                  />
                </div>

                <div className="alternatives-edit-list">
                  <label>Alternativas (marque a correta):</label>
                  {p.alternativas.map((alt, aIdx) => (
                    <div key={aIdx} className="alt-edit-row">
                      <input
                        type="radio"
                        name={`correta_${qIdx}`}
                        checked={alt.correta}
                        onChange={() => handleSetCorreta(qIdx, aIdx)}
                        title="Marcar como correta"
                      />
                      <input
                        type="text"
                        placeholder={`Alternativa ${aIdx + 1}...`}
                        value={alt.texto}
                        onChange={(e) => {
                          const copy = [...perguntas]
                          copy[qIdx].alternativas[aIdx].texto = e.target.value
                          setPerguntas(copy)
                        }}
                        required
                      />
                      {alt.correta && <span className="tag-correct">Gabarito</span>}
                    </div>
                  ))}

                  <button
                    type="button"
                    className="btn-add-alt"
                    onClick={() => handleAddAlternativa(qIdx)}
                  >
                    ＋ Adicionar Alternativa
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn-secondary"
              onClick={handleAddPergunta}
            >
              ＋ Adicionar Outra Questão
            </button>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setCriando(false)}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Quiz no Banco'}
            </button>
          </div>
        </form>
      )}

      {/* Lista de Quizzes Existentes */}
      <div className="quizzes-grid">
        {carregando ? (
          <p>Carregando seus quizzes...</p>
        ) : quizzes.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📂</span>
            <h3>Nenhum quiz cadastrado ainda</h3>
            <p>Clique em "+ Novo Quiz" acima para cadastrar seu primeiro conjunto de questões.</p>
          </div>
        ) : (
          quizzes.map((q) => (
            <div key={q.id} className="quiz-card">
              <div className="quiz-card-header">
                <h3>{q.titulo}</h3>
                <span className="badge-q-count">{q.total_perguntas} questões</span>
              </div>
              {q.descricao && <p className="quiz-desc">{q.descricao}</p>}

              <div className="quiz-card-tags">
                <span className="tag-small">
                  {q.modo_execucao === 'grupo' ? '👥 Grupo' : '👤 Individual'}
                </span>
                <span className="tag-small">
                  {q.competitivo ? '🏆 Competitivo' : `🤝 Cooperativo (${q.meta_coletiva_percentual || 80}%)`}
                </span>
                <span className="tag-small">
                  {q.obrigatorio ? 'Obrigatório' : 'Opcional'}
                </span>
              </div>

              <div className="quiz-card-footer">
                <button
                  className="btn-delete"
                  onClick={() => handleDeletar(q.id)}
                  title="Excluir quiz"
                >
                  🗑️
                </button>
                {onIniciarPartidaComQuiz && (
                  <button
                    className="btn-launch"
                    onClick={() => onIniciarPartidaComQuiz(q.id)}
                  >
                    🚀 Aplicar na Aula
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
