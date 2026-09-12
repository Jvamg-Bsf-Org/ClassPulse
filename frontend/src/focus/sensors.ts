/**
 * Adaptador fino entre os sensores reais do navegador e a lógica pura de
 * FocusSession. Diferente de focusSession.ts, isto NÃO tem teste automatizado
 * — depende de acelerômetro/giroscópio de verdade, e só dá pra validar num
 * celular físico.
 */
import { FocusSession, type FocusSessionEvents } from "./focusSession";

interface EventoComPermissaoIOS {
  requestPermission: () => Promise<"granted" | "denied">;
}

function temPermissaoIOS(ctor: unknown): ctor is EventoComPermissaoIOS {
  return typeof (ctor as Partial<EventoComPermissaoIOS>)?.requestPermission === "function";
}

/**
 * Pede permissão de orientação/movimento. PRECISA ser chamado como reação
 * direta a um toque do usuário (ex: dentro do onClick de um botão) — no iOS
 * 13+, o navegador recusa a chamada se ela não vier de um gesto síncrono.
 * Em navegadores sem essa exigência (Android, desktop), resolve `true` sem
 * mostrar nada, já que lá os eventos funcionam sem pedir permissão.
 */
export async function solicitarPermissaoSensores(): Promise<boolean> {
  const construtores = [
    window.DeviceOrientationEvent as unknown,
    window.DeviceMotionEvent as unknown,
  ].filter((c): c is EventoComPermissaoIOS & (new (...args: never[]) => unknown) => temPermissaoIOS(c));

  if (construtores.length === 0) return true; // navegador não exige permissão explícita

  try {
    const resultados = await Promise.all(construtores.map((c) => c.requestPermission()));
    return resultados.every((r) => r === "granted");
  } catch {
    return false;
  }
}

export function sensoresSuportados(): boolean {
  return typeof window !== "undefined" && "DeviceOrientationEvent" in window;
}

export interface SessaoAtiva {
  sessao: FocusSession;
  parar: () => void;
}

/** Liga a FocusSession aos eventos reais do navegador. Chamar depois de `solicitarPermissaoSensores`. */
export function iniciarSessaoDeFoco(eventos: FocusSessionEvents = {}): SessaoAtiva {
  const sessao = new FocusSession(eventos);

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
