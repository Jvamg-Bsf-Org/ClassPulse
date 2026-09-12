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

    // 10 leituras quase idênticas ao longo de 2.2s -> parado
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
      s.reportarMotion(9.8 + (i % 2 === 0 ? 3 : -3)); // oscilação grande = mão mexendo
      relogio.avancar(220);
    }

    expect(s.resumo().estadoAtual).toBe("aguardando");
  });

  it("não confia em poucas amostras que ainda não cobrem a janela toda", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaImobilidadeMs: 2000, limiarImobilidade: 0.3 });

    // só 2 leituras juntas, não cobre os 2s da janela ainda
    s.reportarMotion(9.8);
    relogio.avancar(100);
    s.reportarMotion(9.8);

    expect(s.resumo().estadoAtual).toBe("aguardando");
  });
});

describe("FocusSession — contagem de tempo por visibilidade", () => {
  it("acumula foco enquanto oculto DEPOIS de confirmar proteção", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now });

    s.reportarOrientacao(180); // confirma proteção, ainda visível
    s.reportarVisibilidade(false); // esconde -> devia ir pra "focado"
    relogio.avancar(45_000); // 45s guardado
    s.reportarVisibilidade(true); // volta

    const r = s.resumo();
    expect(r.focoSegundos).toBe(45);
    expect(r.distracaoSegundos).toBe(0);
  });

  it("acumula distração se esconder SEM confirmar proteção antes", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now });

    s.reportarVisibilidade(false); // sumiu sem virar/parar antes -> "distraido"
    relogio.avancar(20_000);
    s.reportarVisibilidade(true);

    const r = s.resumo();
    expect(r.focoSegundos).toBe(0);
    expect(r.distracaoSegundos).toBe(20);
  });

  it("exige confirmação nova a cada sumida (não carrega proteção antiga)", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now });

    s.reportarOrientacao(180);
    s.reportarVisibilidade(false); // focado
    relogio.avancar(10_000);
    s.reportarVisibilidade(true); // voltou, reseta a proteção

    s.reportarVisibilidade(false); // sumiu de novo SEM confirmar de novo -> distraido
    relogio.avancar(15_000);
    s.reportarVisibilidade(true);

    const r = s.resumo();
    expect(r.focoSegundos).toBe(10);
    expect(r.distracaoSegundos).toBe(15);
  });

  it("flip-flop rápido de quem fica checando o Instagram conta quase tudo como distração", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now });

    for (let i = 0; i < 5; i++) {
      s.reportarVisibilidade(false); // nunca confirmou proteção -> distraido
      relogio.avancar(3_000);
      s.reportarVisibilidade(true);
      relogio.avancar(1_000);
    }

    const r = s.resumo();
    expect(r.distracaoSegundos).toBe(15);
    expect(r.focoSegundos).toBe(0);
  });
});

describe("FocusSession — benefício da dúvida (virou o celular depois de já estar escondido)", () => {
  it("some sem confirmar e some por pouco tempo -> conta tudo como distração (nada muda)", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaConfirmacaoTardiaMs: 20_000 });

    s.reportarVisibilidade(false); // saiu sem ter virado/parado o celular ainda
    relogio.avancar(8_000); // só 8s, abaixo da janela de tolerância de 20s
    s.reportarVisibilidade(true);

    const r = s.resumo();
    expect(r.distracaoSegundos).toBe(8);
    expect(r.focoSegundos).toBe(0);
  });

  it("some sem confirmar mas fica escondido MUITO além da janela -> excedente vira foco", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaConfirmacaoTardiaMs: 20_000 });

    s.reportarVisibilidade(false); // saiu rápido, sem confirmar (ex: foi virar o celular só depois)
    relogio.avancar(20_000 + 40_000); // ficou escondido bem mais que a janela, nunca mais voltou pra checar
    s.reportarVisibilidade(true); // só volta no fim da aula

    const r = s.resumo();
    expect(r.distracaoSegundos).toBe(20); // só os primeiros 20s (a janela) contam contra ele
    expect(r.focoSegundos).toBe(40); // o resto ganha o benefício da dúvida
  });

  it("o benefício da dúvida aparece em tempo real, mesmo sem ele ter voltado ainda (poll do backend)", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaConfirmacaoTardiaMs: 20_000 });

    s.reportarVisibilidade(false);
    relogio.avancar(25_000); // ainda escondido, ninguém chamou reportarVisibilidade(true)

    const parcial = s.resumo(); // simula um poll periódico batendo enquanto ele ainda tá "sumido"
    expect(parcial.distracaoSegundos).toBe(20);
    expect(parcial.focoSegundos).toBe(5);
    expect(parcial.estadoAtual).toBe("distraido");

    relogio.avancar(10_000); // continua escondido mais um pouco
    const final = s.resumo();
    expect(final.distracaoSegundos).toBe(20); // não cresce mais, já passou da janela
    expect(final.focoSegundos).toBe(15);
  });

  it("virar o celular ANTES de esconder continua sendo o caminho ideal: 100% foco, sem janela nenhuma", () => {
    const relogio = criarRelogio();
    const s = new FocusSession({ now: relogio.now, janelaConfirmacaoTardiaMs: 20_000 });

    s.reportarOrientacao(180); // confirma antes de sumir
    s.reportarVisibilidade(false);
    relogio.avancar(3_000); // nem precisa esperar janela nenhuma, já é foco desde o segundo 0
    s.reportarVisibilidade(true);

    const r = s.resumo();
    expect(r.focoSegundos).toBe(3);
    expect(r.distracaoSegundos).toBe(0);
  });
});
