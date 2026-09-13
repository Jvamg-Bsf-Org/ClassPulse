import { describe, expect, it } from "vitest";
import { FocusSession } from "./focusSession";

/** Relógio falso controlável pelos testes — avança só quando o teste manda. */
function criarRelogio(inicioMs = 0) {
  let t = inicioMs;
  return { now: () => t, avancar: (ms: number) => (t += ms) };
}

describe("FocusSession — orientação", () => {
  it("marca protegido quando o beta chega perto de 180° (de cara pra baixo)", () => {
    const eventos: boolean[] = [];
    const s = new FocusSession({ onProtegidoChange: (p) => eventos.push(p) });

    s.reportarOrientacao(178);

    expect(eventos).toEqual([true]);
    expect(s.resumo().estadoAtual).toBe("protegido_visivel");
  });

  it("também aceita -180 (wraparound do ângulo)", () => {
    const s = new FocusSession();
    s.reportarOrientacao(-179);
    expect(s.resumo().estadoAtual).toBe("protegido_visivel");
  });

  it("NÃO marca protegido com o celular de cara pra cima (beta perto de 0)", () => {
    const s = new FocusSession();
    s.reportarOrientacao(5);
    expect(s.resumo().estadoAtual).toBe("aguardando");
  });
});

describe("FocusSession — imobilidade", () => {
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
    const s = new FocusSession({ now: relogio.now, janelaReacaoMs: 20_000 });

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
    const s = new FocusSession({ now: relogio.now, janelaReacaoMs: 20_000 });

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
    const s = new FocusSession({ now: relogio.now, janelaReacaoMs: 20_000 });

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

describe("FocusSession — revogação da proteção por movimento significativo", () => {
  it("um blip de orientação seguido de manuseio de verdade é revogado -- bloquear depois conta como distração", () => {
    const relogio = criarRelogio();
    const eventos: boolean[] = [];
    const s = new FocusSession({
      now: relogio.now,
      limiarMovimentoSignificativo: 3,
      amostrasMovimentoParaRevogar: 3,
      onProtegidoChange: (p) => eventos.push(p),
    });

    s.reportarOrientacao(180); // confirma na hora (ex: girou o pulso por acaso)
    expect(s.resumo().estadoAtual).toBe("protegido_visivel");

    relogio.avancar(1_000); // continua visível e "protegido" por enquanto

    // pega o celular e usa de verdade: variação grande e sustentada (não só um pico isolado)
    s.reportarMotion(9.8);
    relogio.avancar(50);
    s.reportarMotion(13);
    relogio.avancar(50);
    s.reportarMotion(17);
    relogio.avancar(50);
    s.reportarMotion(11);

    expect(eventos).toEqual([true, false]); // confirmou, depois foi revogado
    expect(s.resumo().estadoAtual).toBe("aguardando");

    // bloqueia a tela agora, sem ter confirmado de novo -> distração cheia,
    // exatamente o comportamento esperado ("último comportamento antes de
    // ficar oculto" já não é mais uma confirmação válida)
    s.reportarVisibilidade(false);
    relogio.avancar(10_000);
    s.reportarVisibilidade(true);

    expect(s.resumo().distracaoSegundos).toBe(10);
  });

  it("um pico isolado de movimento NÃO revoga -- ele sempre gera só 2 deltas grandes (subida e descida), abaixo do exigido", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, limiarMovimentoSignificativo: 3, amostrasMovimentoParaRevogar: 3 });

    s.reportarOrientacao(180);
    s.reportarMotion(9.8);
    relogio.avancar(50);
    s.reportarMotion(15); // um pico só (solavanco, ruído) -- sobe (delta grande)...
    relogio.avancar(50);
    s.reportarMotion(9.85); // ...e desce (delta grande de novo), mas só 2 no total

    expect(s.resumo().estadoAtual).toBe("protegido_visivel");
  });

  it("movimento pequeno (tremor de mão) fica na zona morta e não revoga proteção já confirmada", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, limiarImobilidade: 0.5, limiarMovimentoSignificativo: 3 });

    s.reportarOrientacao(180);
    for (let i = 0; i < 6; i++) {
      s.reportarMotion(9.8 + (i % 2 === 0 ? 1.2 : -1.2)); // delta ~2.4 -- entre os dois limiares
      relogio.avancar(100);
    }

    expect(s.resumo().estadoAtual).toBe("protegido_visivel");
  });

  it("a checagem de revogação só vale visível -- movimento enquanto escondido não desfaz o foco", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, limiarMovimentoSignificativo: 3 });

    s.reportarOrientacao(180);
    s.reportarVisibilidade(false); // agora focado (escondido)
    s.reportarMotion(9.8);
    relogio.avancar(50);
    s.reportarMotion(20); // pico grande, mas escondido -- não deveria mexer em nada
    relogio.avancar(50);
    s.reportarMotion(9.8);

    expect(s.resumo().estadoAtual).toBe("focado");
  });
});
