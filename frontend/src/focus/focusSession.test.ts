import { describe, expect, it } from "vitest";
import { FocusSession } from "./focusSession";

/** Relógio falso controlável pelos testes — avança só quando o teste manda. */
function criarRelogio(inicioMs = 0) {
  let t = inicioMs;
  return { now: () => t, avancar: (ms: number) => (t += ms) };
}

describe("FocusSession — orientação", () => {
  it("marca protegido quando o beta fica ESTÁVEL perto de 180° (de cara pra baixo)", () => {
    const relogio = criarRelogio();
    const eventos: boolean[] = [];
    // janelaConfirmacaoMs: 0 -- estes testes checam a lógica de ângulo em si,
    // não a janela de estabilidade (que tem testes dedicados mais abaixo).
    const s = new FocusSession({ now: relogio.now, janelaConfirmacaoMs: 0, onProtegidoChange: (p) => eventos.push(p) });

    s.reportarOrientacao(178);

    expect(eventos).toEqual([true]);
    expect(s.resumo().estadoAtual).toBe("protegido_visivel");
  });

  it("também aceita -180 (wraparound do ângulo)", () => {
    const s = new FocusSession({ janelaConfirmacaoMs: 0 });
    s.reportarOrientacao(-179);
    expect(s.resumo().estadoAtual).toBe("protegido_visivel");
  });

  it("NÃO marca protegido com o celular de cara pra cima (beta perto de 0)", () => {
    const s = new FocusSession({ janelaConfirmacaoMs: 0 });
    s.reportarOrientacao(5);
    expect(s.resumo().estadoAtual).toBe("aguardando");
  });
});

describe("FocusSession — orientação exige estabilidade (não é mais instantâneo)", () => {
  it("uma única leitura de bruços NÃO confirma na hora -- precisa ficar estável por janelaConfirmacaoMs", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaConfirmacaoMs: 1000 });

    s.reportarOrientacao(178);
    expect(s.resumo().estadoAtual).toBe("aguardando");

    relogio.avancar(500);
    s.reportarOrientacao(178); // ainda dentro da janela de estabilidade
    expect(s.resumo().estadoAtual).toBe("aguardando");

    relogio.avancar(600); // agora passou de 1000ms estável
    s.reportarOrientacao(178);
    expect(s.resumo().estadoAtual).toBe("protegido_visivel");
  });

  it("sair da posição de bruços no meio do caminho reinicia a contagem de estabilidade", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaConfirmacaoMs: 1000 });

    s.reportarOrientacao(178);
    relogio.avancar(800);
    s.reportarOrientacao(10); // saiu da posição de bruços -- reinicia
    relogio.avancar(800);
    s.reportarOrientacao(178); // só 0ms estável de novo até agora
    expect(s.resumo().estadoAtual).toBe("aguardando");

    relogio.avancar(1000);
    s.reportarOrientacao(178);
    expect(s.resumo().estadoAtual).toBe("protegido_visivel");
  });
});

describe("FocusSession — imobilidade (via aceleração)", () => {
  it("marca protegido depois de ficar parado pela janela inteira", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaImobilidadeMs: 2000, limiarImobilidade: 0.3 });

    for (let i = 0; i < 11; i++) {
      s.reportarMotion(9.8 + (i % 2 === 0 ? 0.05 : -0.05));
      relogio.avancar(220);
    }

    expect(s.resumo().estadoAtual).toBe("protegido_visivel");
  });

  it("NÃO marca protegido se está sendo carregado na mão (variação grande)", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaImobilidadeMs: 2000, limiarImobilidade: 0.3 });

    for (let i = 0; i < 11; i++) {
      s.reportarMotion(9.8 + (i % 2 === 0 ? 3 : -3));
      relogio.avancar(220);
    }

    expect(s.resumo().estadoAtual).toBe("aguardando");
  });

  it("não confia em poucas amostras que ainda não cobrem a janela toda", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaImobilidadeMs: 2000, limiarImobilidade: 0.3 });

    s.reportarMotion(9.8);
    relogio.avancar(100);
    s.reportarMotion(9.8);

    expect(s.resumo().estadoAtual).toBe("aguardando");
  });
});

describe("FocusSession — manuseio detectado por ROTAÇÃO (o problema relatado no real: sensor 'pouco sensível')", () => {
  it("rotação rápida (alta velocidade angular) revoga a proteção mesmo SEM grande variação de aceleração", () => {
    // Este é o cenário que a versão antiga não pegava: girar o celular pra
    // olhar a tela quase não muda o módulo de accelerationIncludingGravity
    // (o vetor gravidade sempre tem módulo ~9.8), só a direção -- por isso o
    // sinal principal de manuseio agora é o ângulo, não a aceleração.
    const relogio = criarRelogio();
    const eventos: boolean[] = [];
    const s = new FocusSession({
      now: relogio.now,
      janelaConfirmacaoMs: 1000,
      velocidadeAngularManuseio: 25,
      onProtegidoChange: (p) => eventos.push(p),
    });

    s.reportarOrientacao(178);
    relogio.avancar(1000);
    s.reportarOrientacao(178); // confirma por orientação
    expect(s.resumo().estadoAtual).toBe("protegido_visivel");

    // pega o celular e gira rápido pra olhar a tela: 178 -> 20 em 100ms
    // (quase 1600°/s -- bem acima do limiar de 25°/s)
    relogio.avancar(100);
    s.reportarOrientacao(20);

    expect(eventos).toEqual([true, false]);
    expect(s.resumo().estadoAtual).toBe("aguardando");
  });

  it("rotação LENTA (deriva natural, abaixo do limiar de velocidade) NÃO revoga", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaConfirmacaoMs: 1000, velocidadeAngularManuseio: 25 });

    s.reportarOrientacao(178);
    relogio.avancar(1000);
    s.reportarOrientacao(178);
    expect(s.resumo().estadoAtual).toBe("protegido_visivel");

    // beta muda só 10° ao longo de 2s -- 5°/s, bem abaixo do limiar
    relogio.avancar(2000);
    s.reportarOrientacao(168);

    expect(s.resumo().estadoAtual).toBe("protegido_visivel");
  });

  it("dois eventos chegando quase juntos (jitter de sensor real) não inflam ruído pequeno numa 'velocidade' falsa", () => {
    // 3° em 4ms daria 750°/s no cálculo ingênuo (bem acima do limiar de 25) --
    // mas é só jitter de sensor, não manuseio. Precisa de tempo suficiente
    // entre leituras pra a conta de velocidade valer.
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaConfirmacaoMs: 1000, velocidadeAngularManuseio: 25 });

    s.reportarOrientacao(178);
    relogio.avancar(1000);
    s.reportarOrientacao(178);
    expect(s.resumo().estadoAtual).toBe("protegido_visivel");

    relogio.avancar(4);
    s.reportarOrientacao(175); // 3° em 4ms -- ruído, não manuseio

    expect(s.resumo().estadoAtual).toBe("protegido_visivel");
  });

  it("depois de revogado por manuseio, reconfirma rápido se realmente ficar parado nos segundos seguintes (custo baixo do falso positivo)", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaConfirmacaoMs: 1000, janelaReacaoMs: 20_000 });

    s.reportarOrientacao(178);
    relogio.avancar(1000);
    s.reportarOrientacao(178);
    expect(s.resumo().estadoAtual).toBe("protegido_visivel");

    relogio.avancar(100);
    s.reportarOrientacao(20); // manuseio -- revoga
    expect(s.resumo().estadoAtual).toBe("aguardando");

    // solta o celular de bruços nos segundos seguintes e fica parado -- como
    // isso está bem dentro da janela de reação (20s), não custou distração.
    relogio.avancar(200);
    s.reportarOrientacao(178);
    relogio.avancar(1000);
    s.reportarOrientacao(178);

    const r = s.resumo();
    expect(r.estadoAtual).toBe("protegido_visivel");
    expect(r.distracaoSegundos).toBe(0);
  });
});

describe("FocusSession — manuseio detectado por ACELERAÇÃO (sinal secundário)", () => {
  it("variação grande de aceleração revoga mesmo sem mudança de ângulo (ex: arrastar na mesa)", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({
      now: relogio.now,
      janelaImobilidadeMs: 2000,
      limiarImobilidade: 0.3,
      limiarMovimentoSignificativo: 2.0,
    });

    // confirma por imobilidade primeiro
    for (let i = 0; i < 11; i++) {
      s.reportarMotion(9.8 + (i % 2 === 0 ? 0.05 : -0.05));
      relogio.avancar(220);
    }
    expect(s.resumo().estadoAtual).toBe("protegido_visivel");

    relogio.avancar(200);
    s.reportarMotion(15); // salto grande de magnitude -- manuseio

    expect(s.resumo().estadoAtual).toBe("aguardando");
  });

  it("a checagem de manuseio só revoga enquanto visível -- não interfere com o estado já escondido", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaConfirmacaoMs: 0 });

    s.reportarOrientacao(178);
    s.reportarVisibilidade(false); // agora focado (escondido)
    relogio.avancar(100);
    s.reportarMotion(9.8);
    relogio.avancar(50);
    s.reportarMotion(20); // pico grande, mas escondido -- não deveria mexer em nada
    relogio.avancar(50);
    s.reportarMotion(9.8);

    expect(s.resumo().estadoAtual).toBe("focado");
  });
});

describe("FocusSession — janela de reação (visível, sem confirmar)", () => {
  it("dentro da janela é neutro: não conta nem foco nem distração", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaReacaoMs: 20_000 });

    relogio.avancar(15_000); // visível, nunca confirmou, ainda dentro dos 20s

    const r = s.resumo();
    expect(r.focoSegundos).toBe(0);
    expect(r.distracaoSegundos).toBe(0);
    expect(r.estadoAtual).toBe("aguardando");
  });

  it("além da janela, ainda visível e sem confirmar, passa a contar como distração", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaReacaoMs: 20_000 });

    relogio.avancar(35_000); // 35s visível, nunca confirmou

    const r = s.resumo();
    expect(r.distracaoSegundos).toBe(15); // só o excedente (35 - 20)
    expect(r.focoSegundos).toBe(0);
    expect(r.estadoAtual).toBe("distraido");
  });

  it("confirmar atrasado (depois de já estourar a janela) para a distração e começa a contar foco dali pra frente", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaReacaoMs: 20_000, janelaConfirmacaoMs: 0 });

    relogio.avancar(30_000); // 30s visível sem confirmar (10s já contando distração)
    s.reportarOrientacao(180); // confirma atrasado
    relogio.avancar(10_000); // continua visível, agora protegido
    s.reportarVisibilidade(false); // esconde
    relogio.avancar(5_000);
    s.reportarVisibilidade(true);

    const r = s.resumo();
    expect(r.distracaoSegundos).toBe(10); // só os 10s entre estourar a janela e confirmar
    expect(r.focoSegundos).toBe(15); // 10s visível-protegido + 5s escondido
  });
});

describe("FocusSession — confirmar antes de esconder (caminho ideal)", () => {
  it("confirma dentro da janela, fica visível-protegido um tempo, depois esconde: 100% foco", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaReacaoMs: 20_000, janelaConfirmacaoMs: 0 });

    s.reportarOrientacao(180); // confirma quase imediatamente
    relogio.avancar(5_000); // ainda visível, mas já protegido -> conta foco também
    s.reportarVisibilidade(false); // esconde
    relogio.avancar(30_000);
    s.reportarVisibilidade(true);

    const r = s.resumo();
    expect(r.focoSegundos).toBe(35); // 5s visível-protegido + 30s escondido
    expect(r.distracaoSegundos).toBe(0);
  });
});

describe("FocusSession — esconder sem nunca confirmar", () => {
  it("distração desde o segundo 0, sem perdão nenhum, não importa quanto tempo fique escondido", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaReacaoMs: 20_000 });

    s.reportarVisibilidade(false); // fechou a aba sem ter confirmado nada
    relogio.avancar(90_000); // ficou escondido bastante tempo, nunca voltou pra confirmar
    s.reportarVisibilidade(true);

    const r = s.resumo();
    expect(r.distracaoSegundos).toBe(90);
    expect(r.focoSegundos).toBe(0);
  });

  it("flip-flop rápido: cada sumida conta 100% distração, intervalos visíveis curtos ficam neutros", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaReacaoMs: 20_000 });

    for (let i = 0; i < 5; i++) {
      s.reportarVisibilidade(false); // nunca confirma -> distração cheia
      relogio.avancar(3_000);
      s.reportarVisibilidade(true); // volta rápido, dentro da janela de reação -> neutro
      relogio.avancar(1_000);
    }

    const r = s.resumo();
    expect(r.distracaoSegundos).toBe(15);
    expect(r.focoSegundos).toBe(0);
  });

  it("exige confirmação nova a cada sumida — não carrega proteção antiga", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaReacaoMs: 20_000, janelaConfirmacaoMs: 0 });

    s.reportarOrientacao(180);
    s.reportarVisibilidade(false); // focado
    relogio.avancar(10_000);
    s.reportarVisibilidade(true); // volta, reseta a proteção

    s.reportarVisibilidade(false); // sumiu de novo SEM confirmar de novo -> distração cheia
    relogio.avancar(15_000);
    s.reportarVisibilidade(true);

    const r = s.resumo();
    expect(r.focoSegundos).toBe(10);
    expect(r.distracaoSegundos).toBe(15);
  });
});
