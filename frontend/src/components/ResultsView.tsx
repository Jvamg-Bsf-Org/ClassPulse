import type { PartidaResultado } from '../types/game'


interface Props {
  resultado: PartidaResultado
  onVoltar: () => void
}

export default function ResultsView({ resultado, onVoltar }: Props) {
  return (
    <div className="results-container pulse-fade-in">
      <div className="results-header">
        <button className="btn-back" onClick={onVoltar}>
          ← Voltar ao Quiz
        </button>
        <h2>Resultados da Atividade</h2>
      </div>

      {/* Banner de Celebração ou Conquista */}
      {!resultado.competitivo && (
        <div
          className={`coop-banner ${resultado.meta_coletiva_atingida ? 'coop-success' : 'coop-partial'}`}
        >
          <div className="coop-icon">
            {resultado.meta_coletiva_atingida ? '🏆' : '🎯'}
          </div>
          <div>
            <h3>
              {resultado.meta_coletiva_atingida
                ? 'Meta Coletiva Atingida!'
                : 'Resultado Coletivo da Turma'}
            </h3>
            <p>
              A turma alcançou <strong>{resultado.percentual_turma}% de acertos</strong>{' '}
              {resultado.meta_coletiva_percentual && (
                <span>(Meta: {resultado.meta_coletiva_percentual}%)</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Score Individual */}
      <div className="score-card">
        <div className="score-main">
          <span className="score-label">Seu Desempenho no Jogo</span>
          <span className="score-value">
            {resultado.pontuacao_individual} pts
          </span>
          <span className="score-sub">
            {resultado.acertos_individual} de {resultado.total_perguntas} questões acertadas
          </span>
        </div>

        <div className="dual-metric-notice">
          <span className="shield-icon">🛡️</span>
          <div>
            <strong>Métricas Duais ClassPulse</strong>
            <p>
              Seu Score de Foco da Fase 1 permaneceu privado e intacto. Esta pontuação mede apenas
              a absorção prática do conteúdo.
            </p>
          </div>
        </div>
      </div>

      {/* Ranking Competitivo (se aplicável) */}
      {resultado.competitivo && resultado.ranking && (
        <div className="ranking-section">
          <h3>🏆 Classificação da Partida</h3>
          <div className="ranking-list">
            {resultado.ranking.map((item) => (
              <div
                key={item.posicao}
                className={`ranking-item ${item.posicao === 1 ? 'gold' : item.posicao === 2 ? 'silver' : item.posicao === 3 ? 'bronze' : ''}`}
              >
                <div className="ranking-pos">
                  {item.posicao === 1 ? '🥇' : item.posicao === 2 ? '🥈' : item.posicao === 3 ? '🥉' : `#${item.posicao}`}
                </div>
                <div className="ranking-name">{item.nome}</div>
                <div className="ranking-pts">{item.pontos} pts</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gabarito e Explicação Pedagógica */}
      <div className="gabarito-section">
        <h3>📖 Gabarito e Explicações Formativas</h3>
        <p className="gabarito-subtitle">
          Revise os conceitos para fixar o aprendizado da aula:
        </p>

        <div className="gabarito-list">
          {resultado.gabarito.map((pergunta, idx) => (
            <div key={pergunta.id} className="gabarito-card">
              <div className="gabarito-q-header">
                <strong>Questão {idx + 1}:</strong> {pergunta.enunciado}
              </div>

              <div className="gabarito-options">
                {pergunta.alternativas.map((alt) => (
                  <div
                    key={alt.id}
                    className={`gabarito-opt ${alt.correta ? 'is-correct' : 'is-wrong'}`}
                  >
                    <span>{alt.correta ? '✓' : '○'}</span>
                    <span>{alt.texto}</span>
                    {alt.correta && <span className="correct-badge">Correta</span>}
                  </div>
                ))}
              </div>

              {pergunta.explicacao && (
                <div className="explanation-box">
                  <strong>💡 Explicação do Professor:</strong>
                  <p>{pergunta.explicacao}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
