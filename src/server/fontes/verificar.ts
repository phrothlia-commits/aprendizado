/**
 * Verifica no servidor se um link responde antes de exibi-lo.
 * Link quebrado (404, 410, 5xx, DNS, tempo esgotado) é descartado.
 * 401/403/429 contam como "responde": a página existe, mas bloqueia robôs
 * (comum em lojas e editoras); o usuário consegue abrir no navegador.
 */
export type ResultadoVerificacao = { url: string; ok: boolean; status: number | null; motivo?: string };

type Fetch = typeof fetch;

const VIVOS_MESMO_COM_BLOQUEIO = new Set([401, 403, 429]);
const USER_AGENT = "Mozilla/5.0 (compatible; TrilhaDeEstudos/1.0; verificador de links)";

function statusVivo(status: number): boolean {
  return (status >= 200 && status < 400) || VIVOS_MESMO_COM_BLOQUEIO.has(status);
}

async function tentar(url: string, metodo: "HEAD" | "GET", f: Fetch, timeoutMs: number): Promise<number> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);
  try {
    const r = await f(url, {
      method: metodo,
      redirect: "follow",
      signal: controle.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/pdf,*/*;q=0.8" },
    });
    // Não baixa o corpo inteiro: só o status interessa.
    try {
      await r.body?.cancel();
    } catch {}
    return r.status;
  } finally {
    clearTimeout(timer);
  }
}

export async function verificarLink(url: string, opcoes: { fetch?: Fetch; timeoutMs?: number } = {}): Promise<ResultadoVerificacao> {
  const f = opcoes.fetch ?? fetch;
  const timeoutMs = opcoes.timeoutMs ?? 8000;
  let status: number | null = null;
  try {
    status = await tentar(url, "HEAD", f, timeoutMs);
    // Muitos servidores não aceitam HEAD: confirma com GET antes de descartar.
    if (!statusVivo(status) || status === 405) status = await tentar(url, "GET", f, timeoutMs);
  } catch (e) {
    try {
      status = await tentar(url, "GET", f, timeoutMs);
    } catch {
      return { url, ok: false, status: null, motivo: (e as Error).name === "AbortError" ? "tempo esgotado" : "sem resposta" };
    }
  }
  return { url, ok: statusVivo(status), status, motivo: statusVivo(status) ? undefined : `HTTP ${status}` };
}

/** Verifica vários links em paralelo, com limite de concorrência. */
export async function verificarLinks(urls: string[], opcoes: { fetch?: Fetch; timeoutMs?: number; concorrencia?: number } = {}) {
  const fila = [...new Set(urls)];
  const resultados = new Map<string, ResultadoVerificacao>();
  const trabalhadores = Array.from({ length: Math.min(opcoes.concorrencia ?? 6, fila.length) }, async () => {
    for (let u = fila.shift(); u; u = fila.shift()) resultados.set(u, await verificarLink(u, opcoes));
  });
  await Promise.all(trabalhadores);
  return resultados;
}
