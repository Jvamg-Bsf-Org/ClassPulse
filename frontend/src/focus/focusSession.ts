/**
 * Lógica pura de classificação do Modo Foco: decide se o celular está
 * "protegido" (guardado) e acumula segundos de foco/distração.
 *
 * Propositalmente sem `window`/`document` aqui dentro — só números entrando
 * (ângulo, magnitude de aceleração, visível/oculto) e estado saindo. Isso é o
 * que permite testar a classificação sem precisar de um celular de verdade;
 * quem liga isso a sensores reais é o adaptador em sensors.ts.
 *
 * ==========================================================================
 * O QUE MUDOU NESTA REFORMULAÇÃO (v2) E POR QUÊ
 * ==========================================================================
 *
 * A versão anterior detectava "manuseio" (celular sendo mexido) quase só
 * olhando a MAGNITUDE de `accelerationIncludingGravity`. Isso é uma falha de
 * design, não só um número mal calibrado: o vetor gravidade tem módulo
 * constante (~9.8 m/s²) INDEPENDENTE da direção. Girar o celular devagar pra
 * checar a tela -- o jeito mais comum de "distração rápida" -- muda a
 * DIREÇÃO do vetor, não o módulo, e por isso quase não aparecia na magnitude.
 * Resultado prático relatado: o sensor "parece pouco sensível".
 *
 * A correção: o sinal PRINCIPAL de manuseio agora é a VELOCIDADE ANGULAR
 * (graus/segundo) calculada a partir do próprio ângulo de orientação (beta)
 * -- pegar o celular pra olhar muda o ângulo relatado rapidamente e sem
 * ambiguidade, é uma rotação real, não uma leitura de aceleração que pode ou
 * não refletir isso. A magnitude de aceleração vira sinal SECUNDÁRIO, útil
 * só pra pegar o caso raro de movimento translacional sem rotação (arrastar
 * o celular na mesa mantendo o mesmo ângulo).
 *
 * Segunda mudança: confirmar proteção deixou de ser instantâneo (um único
 * ângulo de bruços já bastava antes). Agora exige ficar ESTÁVEL de bruços
 * por `janelaConfirmacaoMs` -- filtra um giro de pulso acidental que passa
 * por perto de 180° sem a pessoa ter realmente guardado o celular.
 *
 * Terceira mudança: revogação deixou de exigir várias leituras "grandes"
 * seguidas (aquilo tinha um furo -- um ÚNICO pico de ruído sempre gera 2
 * deltas grandes, então "exigir 2" não filtrava nada). Agora qualquer
 * evidência de manuseio revoga na hora. Um falso positivo por ruído custa
 * pouco: a sessão só volta pra "aguardando" e reconfirma no próximo segundo
 * se a pessoa realmente não tinha mexido em nada -- e por estar dentro da
 * janela de reação, nem chega a contar como distração.
 *
 * Duas formas independentes de confirmar "protegido" (qualquer uma vale):
 *   - orientação: celular ESTÁVEL de cara pra baixo (ângulo beta perto de
 *     ±180°) por pelo menos `janelaConfirmacaoMs`.
 *   - imobilidade: celular parado (sem variação de aceleração NEM de ângulo)
 *     por `janelaImobilidadeMs` -- não importa a orientação, cobre quem só
 *     deixa o celular quieto na mesa sem virar, ou guardado na bolsa/bolso.
 *
 * O que decide foco vs distração não é "visível ou escondido" — é "confirmou
 * proteção ou não":
 *   - visível, dentro da janela de reação (`janelaReacaoMs`) e sem confirmar: neutro
 *     (acabou de ver "guarde o celular", precisa de um segundo pra reagir).
 *   - visível, ALÉM da janela de reação e ainda sem confirmar: distração — tá
 *     com o celular aceso na mão, isso não depende de sensor nenhum.
 *   - confirmou (a qualquer momento, mesmo atrasado): foco a partir daí, visível
 *     ou escondido — não importa mais... a não ser que detecte manuseio de
 *     verdade depois (ver revogação acima).
 *   - escondeu (fechou a aba/trocou de app) SEM nunca ter confirmado: distração,
 *     sem perdão, desde o segundo 0 — ele não provou que guardou.
 *   - toda volta pra tela reseta tudo: a próxima sumida exige confirmação nova.
 *
 * Sem sensor confirmado não tem "modo generoso" aqui -- essa decisão é tomada
 * antes, no gate de entrada da aula (ver AlunoApp): sem sensor, o aluno nem
 * entra. Então dentro desta classe, chegar aqui já significa sensor ativo.
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
  /** Janela de tempo (ms) observada pra considerar o celular "parado" (via aceleração). */
  janelaImobilidadeMs?: number;
  /** Variação máxima de aceleração (m/s², entre amostras) tolerada como "parado". */
  limiarImobilidade?: number;
  /** Tempo de reação (ms) visível-sem-confirmar antes de começar a contar como distração. */
  janelaReacaoMs?: number;
  /**
   * Quanto tempo (ms) o celular precisa ficar CONTINUAMENTE de bruços antes
   * de confirmar proteção por orientação -- e também o tempo mínimo desde o
   * último manuseio detectado antes de aceitar uma confirmação nova (por
   * orientação OU imobilidade). Filtra um giro acidental que passa perto de
   * 180° sem ser de propósito.
   */
  janelaConfirmacaoMs?: number;
  /**
   * Velocidade angular (graus/segundo, calculada a partir do beta) que já
   * indica manuseio de verdade. É o sinal PRINCIPAL de manuseio -- ver
   * explicação no topo do arquivo sobre por que aceleração sozinha é cega
   * pra rotação lenta.
   */
  velocidadeAngularManuseio?: number;
  /**
   * Variação de aceleração (m/s², entre amostras) que também indica manuseio
   * -- sinal SECUNDÁRIO, pega movimento translacional sem rotação.
   */
  limiarMovimentoSignificativo?: number;
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
  janelaConfirmacaoMs: 1000,
  // Girar o pulso pra olhar a tela facilmente passa de 40-60°/s; segurar
  // parado (mesmo com tremor de mão) fica na casa de poucos graus/segundo.
  velocidadeAngularManuseio: 25,
  limiarMovimentoSignificativo: 2.0,
} as const;

/** Menor distância angular entre dois ângulos em graus (-180..180), tratando o wraparound. */
function diferencaAngular(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export class FocusSession {
  private estado: EstadoFocoSessao = "aguardando";
  private protegido = false;
  private motivoProtegido: MotivoProtecao | null = null;

  private focoSegundosAcumulado = 0;
  private distracaoSegundosAcumulado = 0;
  private ultimaTransicaoEm: number;

  // -- Canal de orientação --
  private betaAnterior: number | null = null;
  private tOrientacaoAnterior: number | null = null;
  /** Desde quando o beta está CONTINUAMENTE dentro da tolerância de bruços (null = não está). */
  private faceDownDesde: number | null = null;

  // -- Canal de aceleração (imobilidade) --
  private ultimaMagnitude: number | null = null;
  private amostrasMotion: { t: number; delta: number }[] = [];

  // -- Manuseio (compartilhado entre os dois canais) --
  /** Timestamp da última evidência de manuseio de verdade, de qualquer canal. */
  private ultimoManuseioEm = -Infinity;

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
    const agora = this.agora();
    const tolerancia = this.opts.toleranciaFaceDownGraus ?? DEFAULTS.toleranciaFaceDownGraus;
    const janela = this.opts.janelaConfirmacaoMs ?? DEFAULTS.janelaConfirmacaoMs;
    const limiarVelocidade = this.opts.velocidadeAngularManuseio ?? DEFAULTS.velocidadeAngularManuseio;

    if (this.betaAnterior !== null && this.tOrientacaoAnterior !== null) {
      const deltaAngular = diferencaAngular(betaGraus, this.betaAnterior);
      const deltaTempoS = Math.max((agora - this.tOrientacaoAnterior) / 1000, 0.001);
      const velocidadeAngular = deltaAngular / deltaTempoS;
      if (velocidadeAngular > limiarVelocidade) this.registrarManuseio(agora);
    }
    this.betaAnterior = betaGraus;
    this.tOrientacaoAnterior = agora;

    const deCaraPraBaixo = Math.abs(Math.abs(betaGraus) - 180) <= tolerancia;
    if (!deCaraPraBaixo) {
      this.faceDownDesde = null;
      return;
    }
    if (this.faceDownDesde === null) this.faceDownDesde = agora;

    const estavelPorTempoSuficiente = agora - this.faceDownDesde >= janela;
    const semManuseioRecente = agora - this.ultimoManuseioEm >= janela;
    if (estavelPorTempoSuficiente && semManuseioRecente) this.marcarProtegido("orientacao");
  }

  /** Chamar a cada leitura de `devicemotion` com a magnitude da aceleração (m/s²). */
  reportarMotion(magnitudeAceleracao: number): void {
    const agora = this.agora();
    const janelaImobilidade = this.opts.janelaImobilidadeMs ?? DEFAULTS.janelaImobilidadeMs;
    const limiarImobilidade = this.opts.limiarImobilidade ?? DEFAULTS.limiarImobilidade;
    const limiarManuseio = this.opts.limiarMovimentoSignificativo ?? DEFAULTS.limiarMovimentoSignificativo;
    const janelaConfirmacao = this.opts.janelaConfirmacaoMs ?? DEFAULTS.janelaConfirmacaoMs;

    if (this.ultimaMagnitude !== null) {
      const delta = Math.abs(magnitudeAceleracao - this.ultimaMagnitude);
      this.amostrasMotion.push({ t: agora, delta });
      if (delta > limiarManuseio) this.registrarManuseio(agora);
    }
    this.ultimaMagnitude = magnitudeAceleracao;
    this.amostrasMotion = this.amostrasMotion.filter((a) => agora - a.t <= janelaImobilidade);

    const cobreAJanelaToda =
      this.amostrasMotion.length > 0 && agora - this.amostrasMotion[0].t >= janelaImobilidade * 0.8;
    const semVariacaoRelevante = this.amostrasMotion.every((a) => a.delta <= limiarImobilidade);
    const semManuseioRecente = agora - this.ultimoManuseioEm >= janelaConfirmacao;

    if (cobreAJanelaToda && semVariacaoRelevante && semManuseioRecente) {
      this.marcarProtegido("imobilidade");
    }
  }

  /**
   * Evidência de manuseio de verdade, vinda de qualquer canal (rotação
   * rápida via ângulo, ou variação de aceleração). Bloqueia confirmações
   * novas por `janelaConfirmacaoMs` e, se já tinha proteção confirmada,
   * revoga na hora -- sem exigir várias leituras seguidas (um falso positivo
   * isolado custa só um reconfirmar rápido, não vale complicar o filtro).
   */
  private registrarManuseio(agora: number): void {
    this.ultimoManuseioEm = agora;
    if (this.protegido && this.estado === "protegido_visivel") this.revogarProtecao();
  }

  private revogarProtecao(): void {
    this.protegido = false;
    this.motivoProtegido = null;
    this.faceDownDesde = null;
    this.amostrasMotion = [];
    this.opts.onProtegidoChange?.(false, null);
    this.transicionar("aguardando");
    this.aguardandoDesde = this.ultimaTransicaoEm;
  }

  /** Chamar em todo `visibilitychange` do documento. */
  reportarVisibilidade(visivel: boolean): void {
    if (visivel) {
      this.transicionar("aguardando");
      this.aguardandoDesde = this.ultimaTransicaoEm;
      // Cada sumida nova precisa de uma confirmação nova — não carrega a proteção antiga.
      this.protegido = false;
      this.motivoProtegido = null;
      this.faceDownDesde = null;
      this.amostrasMotion = [];
      this.ultimaMagnitude = null;
      this.betaAnterior = null;
      this.tOrientacaoAnterior = null;
      this.ultimoManuseioEm = -Infinity;
    } else if (this.protegido) {
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
