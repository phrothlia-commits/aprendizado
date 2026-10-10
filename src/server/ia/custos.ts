/**
 * Custo estimado de cada chamada, em dólares, pela tabela pública de preços
 * (por milhão de tokens). É uma estimativa: a fatura oficial está no Console.
 */
export type Preco = { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number };

export const PRECOS: Record<string, Preco> = {
  "claude-opus-5-5": { entrada: 4, saida: 20, cacheLeitura: 0.2, cacheEscrita: 5 },
  "claude-opus-5": { entrada: 5, saida: 25, cacheLeitura: 0.5, cacheEscrita: 6.25 },
  "claude-opus-4-8": { entrada: 5, saida: 25, cacheLeitura: 0.5, cacheEscrita: 6.25 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10, cacheLeitura: 0.2, cacheEscrita: 2.5 },
  "claude-haiku-5-5": { entrada: 0.1, saida: 0.5, cacheLeitura: 0.01, cacheEscrita: 0.125 },
};

/** US$ 10 por 1.000 buscas na web. */
export const CUSTO_POR_BUSCA = 0.01;

export type UsoChamada = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

export function resumirUso(uso: UsoChamada | null | undefined) {
  return {
    input_tokens: uso?.input_tokens ?? 0,
    output_tokens: uso?.output_tokens ?? 0,
    cache_leitura_tokens: uso?.cache_read_input_tokens ?? 0,
    cache_escrita_tokens: uso?.cache_creation_input_tokens ?? 0,
    buscas_web: uso?.server_tool_use?.web_search_requests ?? 0,
  };
}

export function calcularCusto(modelo: string, uso: UsoChamada | null | undefined): number {
  const p = PRECOS[modelo] ?? PRECOS["claude-opus-5-5"];
  const u = resumirUso(uso);
  const custo =
    (u.input_tokens * p.entrada +
      u.output_tokens * p.saida +
      u.cache_leitura_tokens * p.cacheLeitura +
      u.cache_escrita_tokens * p.cacheEscrita) /
      1_000_000 +
    u.buscas_web * CUSTO_POR_BUSCA;
  return Math.round(custo * 10000) / 10000;
}

/** Quanto o cache economizou: tokens lidos do cache pagariam o preço cheio de entrada. */
export function economiaCache(modelo: string, uso: UsoChamada | null | undefined): number {
  const p = PRECOS[modelo] ?? PRECOS["claude-opus-5-5"];
  const lidos = uso?.cache_read_input_tokens ?? 0;
  return Math.round(((lidos * (p.entrada - p.cacheLeitura)) / 1_000_000) * 10000) / 10000;
}
