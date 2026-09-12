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
 * O que decide foco vs distração não é "visível ou escondido" — é "confirmou
 * proteção ou não":
 *   - visível, dentro da janela de reação (`janelaReacaoMs`) e sem confirmar: neutro
 *     (acabou de ver "guarde o celular", precisa de um segundo pra reagir).
 *   - visível, ALÉM da janela de reação e ainda sem confirmar: distração — tá
 *     com o celular aceso na mão, isso não depende de sensor nenhum.
 *   - confirmou (a qualquer momento, mesmo atrasado): foco a partir daí, visível
 *     ou escondido — não importa mais.
 *   - escondeu (fechou a aba/trocou de app) SEM nunca ter confirmado: distração,
 *     sem perdão, desde o segundo 0 — ele não provou que guardou.
 *   - toda volta pra tela reseta tudo: a próxima sumida exige confirmação nova.
 *
 * Exceção: se o navegador não suporta os sensores ou a permissão foi negada
 * (`sensoresDisponiveis: false`), não dá pra exigir uma prova que estruturalmente
 * não existe — nesse caso esconder já conta como foco direto. O lado "visível
 * segurando o celular além da janela = distração" continua valendo igual, já
 * que isso não depende de sensor.
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
  /** Tempo de reação (ms) visível-sem-confirmar antes de começar a contar como distração. */
  janelaReacaoMs?: number;
  /** false se o navegador não suporta os sensores ou a permissão foi negada. Default: true. */
  sensoresDisponiveis?: boolean;
}

export type EstadoFocoSessao =
  | "aguardando" // visível, dentro da janela de reação, ainda sem confirmar
  | "protegido_visivel" // visível, já confirmou proteção
  | "focado" // oculto e (confirmou antes OU sensores indisponíveis)
  | "distraido"; // visível além da janela sem confirmar, OU oculto sem ter confirmado

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
  janelaReacaoMs: 20_000,
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

  /** Timestamp de quando entrou em "aguardando" — usado pra saber quando a janela de reação estoura. */
  private aguardandoDesde: number;

  private readonly opts: FocusSessionOptions;

  constructor(opts: FocusSessionOptions = {}) {
    this.opts = opts;
    this.ultimaTransicaoEm = this.agora();
    this.aguardandoDesde = this.ultimaTransicaoEm;
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
      this.aguardandoDesde = this.ultimaTransicaoEm;
      // Cada sumida nova precisa de uma confirmação nova — não carrega a proteção antiga.
      this.protegido = false;
      this.motivoProtegido = null;
      this.amostrasMotion = [];
      this.ultimaMagnitude = null;
    } else if (this.protegido || this.opts.sensoresDisponiveis === false) {
      this.transicionar("focado");
    } else {
      this.transicionar("distraido");
    }
    this.opts.onVisibilidadeChange?.(visivel);
  }

  private marcarProtegido(motivo: MotivoProtecao): void {
    const eraProtegido = this.protegido;
    this.protegido = true;
    this.motivoProtegido = motivo;
    if (!eraProtegido) this.opts.onProtegidoChange?.(true, motivo);
    // Vale mesmo atrasado: se já tinha estourado a janela de reação e virou "distraido"
    // visível, confirmar agora para de piorar e passa a contar foco dali pra frente.
    if (this.estado === "aguardando" || this.estado === "distraido") this.transicionar("protegido_visivel");
  }

  private transicionar(novoEstado: EstadoFocoSessao): void {
    this.acumularTempo();
    this.estado = novoEstado;
  }

  private acumularTempo(): void {
    const agora = this.agora();

    if (this.estado === "focado" || this.estado === "protegido_visivel") {
      this.focoSegundosAcumulado += (agora - this.ultimaTransicaoEm) / 1000;
    } else if (this.estado === "distraido") {
      this.distracaoSegundosAcumulado += (agora - this.ultimaTransicaoEm) / 1000;
    } else if (this.estado === "aguardando") {
      const janela = this.opts.janelaReacaoMs ?? DEFAULTS.janelaReacaoMs;
      const fimDaJanela = this.aguardandoDesde + janela;
      // até `fimDaJanela` é neutro (tempo de reação); o que passar disso, ainda
      // visível e sem confirmar, já conta como distração.
      const corte = Math.min(agora, Math.max(this.ultimaTransicaoEm, fimDaJanela));
      this.distracaoSegundosAcumulado += (agora - corte) / 1000;
      // promove o rótulo pra refletir que já estourou a janela, mesmo sem ter escondido
      if (agora > fimDaJanela) this.estado = "distraido";
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
