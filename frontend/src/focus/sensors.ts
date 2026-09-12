/**
 * Adaptador fino entre os sensores reais do navegador e a lógica pura de
 * FocusSession. Diferente de focusSession.ts, isto NÃO tem teste automatizado
 * — depende de acelerômetro/giroscópio de verdade, e só dá pra validar num
 * celular físico.
 */
import { FocusSession, type FocusSessionOptions } from "./focusSession";

interface EventoComPermissaoIOS {
  requestPermission: () => Promise<"granted" | "denied">;
}

function temPermissaoIOS(ctor: unknown): ctor is EventoComPermissaoIOS {
  return typeof (ctor as Partial<EventoComPermissaoIOS>)?.requestPermission === "function";
}

/**
 * Confirma que o sensor de orientação/movimento FUNCIONA DE VERDADE — não só
 * que a permissão foi concedida. São dois problemas diferentes:
 *
 *   - iOS 13+: precisa chamar `requestPermission()` como reação direta a um
 *     toque do usuário, senão o navegador recusa.
 *   - Qualquer outro navegador (Brave com Shields, extensões anti-fingerprint,
 *     contexto não-seguro/http): a API pode "existir" no `window` sem nunca
 *     disparar um evento de verdade. Só confirmar `requestPermission` (ou a
 *     ausência dele) não prova nada — por isso esperamos um evento real
 *     chegar, com timeout curto.
 */
export async function solicitarPermissaoSensores(timeoutMs = 2500): Promise<boolean> {
  const construtores = [
    window.DeviceOrientationEvent as unknown,
    window.DeviceMotionEvent as unknown,
  ].filter((c): c is EventoComPermissaoIOS & (new (...args: never[]) => unknown) => temPermissaoIOS(c));

  if (construtores.length > 0) {
    try {
      const resultados = await Promise.all(construtores.map((c) => c.requestPermission()));
      if (!resultados.every((r) => r === "granted")) return false;
    } catch {
      return false;
    }
  }

  return aguardarEventoReal(timeoutMs);
}

function aguardarEventoReal(timeoutMs: number): Promise<boolean> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return Promise.resolve(false);

  return new Promise((resolve) => {
    let resolvido = false;
    const finalizar = (ok: boolean) => {
      if (resolvido) return;
      resolvido = true;
      window.removeEventListener("deviceorientation", aoOrientar);
      window.removeEventListener("devicemotion", aoMover);
      clearTimeout(temporizador);
      resolve(ok);
    };

    const aoOrientar = (e: DeviceOrientationEvent) => {
      if (e.beta !== null || e.gamma !== null || e.alpha !== null) finalizar(true);
    };
    const aoMover = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (a && (a.x !== null || a.y !== null || a.z !== null)) finalizar(true);
    };

    window.addEventListener("deviceorientation", aoOrientar);
    window.addEventListener("devicemotion", aoMover);
    const temporizador = setTimeout(() => finalizar(false), timeoutMs);
  });
}

export interface SessaoAtiva {
  sessao: FocusSession;
  parar: () => void;
}

/** Liga a FocusSession aos eventos reais do navegador. Só chamar depois de confirmar `solicitarPermissaoSensores`. */
export function iniciarSessaoDeFoco(opcoes: FocusSessionOptions = {}): SessaoAtiva {
  const sessao = new FocusSession(opcoes);

  const aoOrientar = (e: DeviceOrientationEvent) => {
    if (e.beta !== null) sessao.reportarOrientacao(e.beta);
  };

  const aoMover = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (a?.x != null && a.y != null && a.z != null) {
      sessao.reportarMotion(Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2));
    }
  };

  const aoMudarVisibilidade = () => {
    sessao.reportarVisibilidade(document.visibilityState === "visible");
  };

  window.addEventListener("deviceorientation", aoOrientar);
  window.addEventListener("devicemotion", aoMover);
  document.addEventListener("visibilitychange", aoMudarVisibilidade);

  return {
    sessao,
    parar: () => {
      window.removeEventListener("deviceorientation", aoOrientar);
      window.removeEventListener("devicemotion", aoMover);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    },
  };
}
