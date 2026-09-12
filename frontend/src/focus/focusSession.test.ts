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
