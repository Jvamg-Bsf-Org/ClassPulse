/**
 * Lógica pura de classificação do Modo Foco: decide se o celular está
 * "protegido" (guardado) e acumula segundos de foco/distração.
 *
 * Propositalmente sem `window`/`document` aqui dentro — só números entrando
 * (ângulo, magnitude de aceleração, visível/oculto) e estado saindo. Isso é o
 * que permite testar a classificação sem precisar de um celular de verdade;
 * quem liga isso a sensores reais é o adaptador em sensors.ts.
 *
 * Duas formas independentes de confirmar "protegido" (qualquer uma vale):
 *   - orientação: celular virado de cara pra baixo (ângulo beta perto de ±180°)
 *   - imobilidade: celular parado (sem variação de aceleração) por um tempo,
 *     não importa a orientação — cobre quem só deixa o celular quieto na mesa
 *     sem virar, ou guardado na bolsa/bolso.
 *
 * Limite conhecido: enquanto a aba está oculta, os sensores não disparam (todo
 * navegador mobile suspende isso em segundo plano por bateria) — então se o
 * aluno sair da aba ANTES de confirmar proteção, e só virar/guardar o celular
 * depois de já estar escondido, a gente não vê esse gesto. Pra não punir esse
 * erro de timing como se fosse distração o tempo todo, `janelaConfirmacaoTardiaMs`
 * dá um "benefício da dúvida": só os primeiros segundos escondido-sem-confirmar
 * contam como distração; se continuar escondido além disso sem voltar, o resto
 * passa a contar como foco. Curto (tipo checar o Instagram e voltar rápido)
 * continua contando 100% como distração — só a ausência longa é que ganha o
 * desconto.
 */

export type MotivoProtecao = "orientacao" | "imobilidade";

export interface FocusSessionEvents {
  onProtegidoChange?(protegido: boolean, motivo: MotivoProtecao | null): void;
  onVisibilidadeChange?(visivel: boolean): void;
}

export interface FocusSessionOptions extends FocusSessionEvents {
  /** Injetável pra teste — por padrão usa o relógio real. */
  now?: () => number;
  /** Tolerância (graus) ao redor de ±180° pra considerar "de cara pra baixo". */
  toleranciaFaceDownGraus?: number;
  /** Janela de tempo (ms) observada pra considerar o celular "parado". */
  janelaImobilidadeMs?: number;
  /** Variação máxima de aceleração (m/s², entre amostras) tolerada como "parado". */
  limiarImobilidade?: number;
  /** Quanto tempo (ms) escondido-sem-confirmar ainda conta como distração antes do benefício da dúvida entrar. */
  janelaConfirmacaoTardiaMs?: number;
}

export type EstadoFocoSessao =
  | "aguardando" // visível, ainda sem confirmação de proteção
  | "protegido_visivel" // visível, já confirmou proteção (pode guardar a qualquer momento)
  | "focado" // oculto, tinha confirmado proteção antes de sumir
  | "distraido"; // oculto, sumiu sem confirmar proteção antes

export interface ResumoFocoSessao {
  focoSegundos: number;
  distracaoSegundos: number;
  estadoAtual: EstadoFocoSessao;
  motivoProtegido: MotivoProtecao | null;
}

const DEFAULTS = {
  toleranciaFaceDownGraus: 30,
  janelaImobilidadeMs: 2500,
  limiarImobilidade: 0.5,
  janelaConfirmacaoTardiaMs: 20_000,
} as const;

export class FocusSession {
  private estado: EstadoFocoSessao = "aguardando";
  private protegido = false;
  private motivoProtegido: MotivoProtecao | null = null;

  private focoSegundosAcumulado = 0;
  private distracaoSegundosAcumulado = 0;
  private ultimaTransicaoEm: number;

  private ultimaMagnitude: number | null = null;
  private amostrasMotion: { t: number; delta: number }[] = [];

  /** Timestamp de quando começou a ficar oculto sem confirmação prévia — null fora desse caso. */
  private ocultoSemConfirmacaoDesde: number | null = null;

  private readonly opts: FocusSessionOptions;

  constructor(opts: FocusSessionOptions = {}) {
    this.opts = opts;
    this.ultimaTransicaoEm = this.agora();
  }

  private agora(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** Chamar a cada leitura de `deviceorientation` com o ângulo beta (graus, -180 a 180). */
  reportarOrientacao(betaGraus: number): void {
    const tolerancia = this.opts.toleranciaFaceDownGraus ?? DEFAULTS.toleranciaFaceDownGraus;
    const deCaraPraBaixo = Math.abs(Math.abs(betaGraus) - 180) <= tolerancia;
    if (deCaraPraBaixo) this.marcarProtegido("orientacao");
  }

  /** Chamar a cada leitura de `devicemotion` com a magnitude da aceleração (m/s²). */
  reportarMotion(magnitudeAceleracao: number): void {
    const janela = this.opts.janelaImobilidadeMs ?? DEFAULTS.janelaImobilidadeMs;
    const limiar = this.opts.limiarImobilidade ?? DEFAULTS.limiarImobilidade;
    const agora = this.agora();

    if (this.ultimaMagnitude !== null) {
      this.amostrasMotion.push({ t: agora, delta: Math.abs(magnitudeAceleracao - this.ultimaMagnitude) });
    }
    this.ultimaMagnitude = magnitudeAceleracao;
    this.amostrasMotion = this.amostrasMotion.filter((a) => agora - a.t <= janela);

    const cobreAJanelaToda =
      this.amostrasMotion.length > 0 && agora - this.amostrasMotion[0].t >= janela * 0.8;
    const semVariacaoRelevante = this.amostrasMotion.every((a) => a.delta <= limiar);

    if (cobreAJanelaToda && semVariacaoRelevante) this.marcarProtegido("imobilidade");
  }

  /** Chamar em todo `visibilitychange` do documento. */
  reportarVisibilidade(visivel: boolean): void {
    if (visivel) {
      this.transicionar("aguardando");
      // Cada sumida nova precisa de uma confirmação nova — não carrega a proteção antiga.
      this.protegido = false;
      this.motivoProtegido = null;
      this.amostrasMotion = [];
      this.ultimaMagnitude = null;
      this.ocultoSemConfirmacaoDesde = null;
    } else if (this.protegido) {
      this.transicionar("focado");
    } else {
      this.transicionar("distraido");
      this.ocultoSemConfirmacaoDesde = this.ultimaTransicaoEm;
    }
    this.opts.onVisibilidadeChange?.(visivel);
  }

  private marcarProtegido(motivo: MotivoProtecao): void {
    const eraProtegido = this.protegido;
    this.protegido = true;
    this.motivoProtegido = motivo;
    if (!eraProtegido) this.opts.onProtegidoChange?.(true, motivo);
    if (this.estado === "aguardando") this.transicionar("protegido_visivel");
  }

  private transicionar(novoEstado: EstadoFocoSessao): void {
    this.acumularTempo();
    this.estado = novoEstado;
  }

  private acumularTempo(): void {
    const agora = this.agora();

    if (this.estado === "focado") {
      this.focoSegundosAcumulado += (agora - this.ultimaTransicaoEm) / 1000;
    } else if (this.estado === "distraido") {
      const janela = this.opts.janelaConfirmacaoTardiaMs ?? DEFAULTS.janelaConfirmacaoTardiaMs;
      const fimDaTolerancia = (this.ocultoSemConfirmacaoDesde ?? this.ultimaTransicaoEm) + janela;
      // até `fimDaTolerancia` conta como distração; o que passar disso (ainda escondido,
      // sem ter voltado) ganha o benefício da dúvida e passa a contar como foco.
      const corte = Math.min(agora, Math.max(this.ultimaTransicaoEm, fimDaTolerancia));
      this.distracaoSegundosAcumulado += (corte - this.ultimaTransicaoEm) / 1000;
      this.focoSegundosAcumulado += (agora - corte) / 1000;
    }

    this.ultimaTransicaoEm = agora;
  }

  resumo(): ResumoFocoSessao {
    this.acumularTempo();
    return {
      focoSegundos: Math.round(this.focoSegundosAcumulado),
      distracaoSegundos: Math.round(this.distracaoSegundosAcumulado),
      estadoAtual: this.estado,
      motivoProtegido: this.motivoProtegido,
    };
  }
}
