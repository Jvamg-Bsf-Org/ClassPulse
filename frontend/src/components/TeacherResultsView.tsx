import type { PartidaResultado } from '../types/game'

interface Props {
  resultado: PartidaResultado
  onVoltar: () => void
}

export default function TeacherResultsView({ resultado, onVoltar }: Props) {
  const totalAlunos = resultado.ranking?.length ?? 0

  return (
    <div className="teacher-results-container pulse-fade-in">
      <div className="teacher-results-header">
        <button className="btn-back" onClick={onVoltar}>
          ← Voltar ao Painel da Aula
        </button>
        <div>
          <h2>📊 Estatísticas da Atividade da Turma</h2>
          <p className="subtitle-text">
            Desempenho consolidado dos alunos e métricas pedagógicas da atividade recém-encerrada.
          </p>
        </div>
      </div>

      {/* Grid de Métricas Consolidadas da Turma */}
      <div className="teacher-metrics-summary-grid">
        <div className="t-summary-card">
          <div className="t-card-header">
            <span>Aproveitamento da Turma</span>
            <span className="t-card-icon">🎯</span>
          </div>
          <div className="t-card-value">{resultado.percentual_turma}%</div>
          <div className="metric-progress-bar" style={{ marginTop: '0.5rem' }}>
            <div
              className="metric-progress-fill"
              style={{
                width: `${Math.min(resultado.percentual_turma, 100)}%`,
                background: resultado.percentual_turma >= 70 ? 'var(--color-success, #10b981)' : 'var(--color-primary, #3b82f6)',
              }}
            />
          </div>
          <span className="t-card-sub">Taxa média de acertos nas respostas</span>
        </div>

        <div className="t-summary-card">
          <div className="t-card-header">
            <span>Status da Meta</span>
            <span className="t-card-icon">
              {resultado.competitivo ? '🏆' : resultado.meta_coletiva_atingida ? '🎉' : '🎯'}
            </span>
          </div>
          <div className="t-card-value">
            {resultado.competitivo
              ? 'Competitivo'
              : resultado.meta_coletiva_atingida
                ? 'Meta Superada'
                : 'Meta Não Atingida'}
          </div>
          <span className="t-card-sub">
            {resultado.competitivo
              ? 'Atividade com ranking individual entre os alunos'
              : resultado.meta_coletiva_percentual
                ? `Alcançado: ${resultado.percentual_turma}% (Meta: ${resultado.meta_coletiva_percentual}%)`
                : 'Atividade cooperativa sem meta definida'}
          </span>
        </div>

        <div className="t-summary-card">
          <div className="t-card-header">
            <span>Participantes</span>
            <span className="t-card-icon">👥</span>
          </div>
          <div className="t-card-value">{totalAlunos}</div>
          <span className="t-card-sub">Alunos que enviaram respostas na atividade</span>
        </div>

        <div className="t-summary-card">
          <div className="t-card-header">
            <span>Total de Questões</span>
            <span className="t-card-icon">📝</span>
          </div>
          <div className="t-card-value">{resultado.total_perguntas}</div>
          <span className="t-card-sub">Perguntas avaliadas nesta rodada</span>
        </div>
      </div>

      {/* Tabela / Ranking de Desempenho dos Alunos */}
      {resultado.ranking && resultado.ranking.length > 0 && (
        <div className="teacher-ranking-card">
          <div className="card-header-with-badge">
            <h3>🏆 Desempenho Individual dos Alunos</h3>
            <span className="badge-counter">{resultado.ranking.length} alunos</span>
          </div>

          <div className="ranking-table-responsive">
            <table className="teacher-table">
              <thead>
                <tr>
                  <th style={{ width: '80px', textAlign: 'center' }}>Posição</th>
                  <th>Nome do Aluno</th>
                  <th style={{ textAlign: 'right' }}>Pontuação</th>
                </tr>
              </thead>
              <tbody>
                {resultado.ranking.map((item) => (
                  <tr key={item.posicao} className={item.posicao <= 3 ? `top-podium top-${item.posicao}` : ''}>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      {item.posicao === 1 ? '🥇 1º' : item.posicao === 2 ? '🥈 2º' : item.posicao === 3 ? '🥉 3º' : `${item.posicao}º`}
                    </td>
                    <td>
                      <strong>{item.nome}</strong>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary, #3b82f6)' }}>
                      {item.pontos} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Gabarito e Explicações Formativas */}
      <div className="teacher-gabarito-card">
        <h3>📖 Gabarito e Justificativas Formativas</h3>
        <p className="subtitle-text">
          Revise as alternativas corretas e as explicações cadastradas para este quiz:
        </p>

        <div className="gabarito-list">
          {resultado.gabarito.map((pergunta, idx) => (
            <div key={pergunta.id} className="gabarito-item-card">
              <div className="gabarito-q-title">
                <span className="q-number">Questão {idx + 1}</span>
                <span className="q-enunciado">{pergunta.enunciado}</span>
              </div>

              <div className="gabarito-alternativas">
                {pergunta.alternativas.map((alt) => (
                  <div
                    key={alt.id}
                    className={`gabarito-alt-pill ${alt.correta ? 'alt-correta' : 'alt-incorreta'}`}
                  >
                    <span>{alt.correta ? '✓' : '•'}</span>
                    <span>{alt.texto}</span>
                    {alt.correta && <span className="correct-tag">Resposta Correta</span>}
                  </div>
                ))}
              </div>

              {pergunta.explicacao && (
                <div className="gabarito-explicacao">
                  <strong>💡 Explicação Pedagógica:</strong> {pergunta.explicacao}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        <button className="btn-primary" onClick={onVoltar} style={{ padding: '0.75rem 2rem' }}>
          Voltar ao Painel da Aula
        </button>
      </div>
    </div>
  )
}
