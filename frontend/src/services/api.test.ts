import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * api.ts usa `localStorage` e `window` direto (pensado pra rodar no
 * navegador). O ambiente de teste do vitest aqui é "node" puro (sem jsdom),
 * então simulamos só o que é usado: um localStorage em memória e um
 * EventTarget pra window.dispatchEvent/addEventListener.
 */
function criarLocalStorageFake() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", criarLocalStorageFake());
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api.ts — armazenamento local do token", () => {
  it("guarda e recupera token/role, e limpa os dois juntos", async () => {
    const { getToken, getRole, setToken, clearAuth } = await import("./api");

    expect(getToken()).toBeNull();
    setToken("abc123", "professor");
    expect(getToken()).toBe("abc123");
    expect(getRole()).toBe("professor");

    clearAuth();
    expect(getToken()).toBeNull();
    expect(getRole()).toBeNull();
  });
});

describe("api.ts — renovação automática de access token expirado", () => {
  it("quando o access token ainda é válido, chama a API normalmente sem tocar em /auth/refresh", async () => {
    const { setToken, minhasTurmas } = await import("./api");
    setToken("token-valido", "professor");

    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("/turmas/minhas");
      return jsonResponse(200, [{ id: 1, nome: "Turma A" }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const turmas = await minhasTurmas();
    expect(turmas).toEqual([{ id: 1, nome: "Turma A" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("no 401 por access token expirado, renova sozinho via /auth/refresh e repete a chamada original -- sem derrubar o usuário", async () => {
    const { setToken, getToken, minhasTurmas } = await import("./api");
    setToken("token-vencido", "professor");

    const chamadas: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      chamadas.push(url);
      if (url === "/turmas/minhas") {
        const jaRenovou = chamadas.filter((u) => u === "/turmas/minhas").length > 1;
        return jaRenovou ? jsonResponse(200, [{ id: 5, nome: "Turma renovada" }]) : jsonResponse(401, { detail: "Token expirado" });
      }
      if (url === "/auth/refresh") {
        return jsonResponse(200, { access_token: "token-novo", token_type: "bearer", tipo: "professor" });
      }
      throw new Error(`URL inesperada: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const turmas = await minhasTurmas();

    expect(turmas).toEqual([{ id: 5, nome: "Turma renovada" }]);
    expect(chamadas).toEqual(["/turmas/minhas", "/auth/refresh", "/turmas/minhas"]);
    expect(getToken()).toBe("token-novo");
  });

  it("se o refresh token também já morreu, desloga de verdade (limpa storage e avisa o app)", async () => {
    const { setToken, getToken, minhasTurmas } = await import("./api");
    setToken("token-vencido", "professor");

    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/turmas/minhas") return jsonResponse(401, { detail: "Token expirado" });
      if (url === "/auth/refresh") return jsonResponse(401, { detail: "Refresh token inválido ou expirado" });
      throw new Error(`URL inesperada: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    let sessaoExpirada = false;
    window.addEventListener("classpulse:sessao-expirada", () => {
      sessaoExpirada = true;
    });

    await expect(minhasTurmas()).rejects.toThrow();

    expect(getToken()).toBeNull();
    expect(sessaoExpirada).toBe(true);
  });

  it("duas chamadas que tomam 401 ao mesmo tempo só disparam UMA renovação (sem bater em paralelo no /auth/refresh)", async () => {
    const { setToken, minhasTurmas, turmasMatriculadas } = await import("./api");
    setToken("token-vencido", "professor");

    let chamadasRefresh = 0;
    const contagemPorPath = new Map<string, number>();
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/auth/refresh") {
        chamadasRefresh += 1;
        return jsonResponse(200, { access_token: "token-novo", token_type: "bearer", tipo: "professor" });
      }
      const vez = (contagemPorPath.get(url) ?? 0) + 1;
      contagemPorPath.set(url, vez);
      return vez === 1 ? jsonResponse(401, { detail: "Token expirado" }) : jsonResponse(200, []);
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([minhasTurmas(), turmasMatriculadas()]);

    expect(chamadasRefresh).toBe(1);
  });
});
