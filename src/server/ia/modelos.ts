/**
 * Único lugar com os ids de modelo da API do Claude e o que cada etapa pode usar.
 * Conferido na documentação da API em 10/2026:
 * - claude-opus-5-5 e claude-sonnet-5-5 aceitam a busca `web_search_20260209` e o
 *   fallback do servidor (`fallbacks: "default"` com o beta server-side-fallback-2026-07-01);
 * - claude-haiku-5-5 não tem fallback do servidor e fica só nas etapas sem busca.
 */

export const MODELOS = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
} as const;

export type IdModelo = (typeof MODELOS)[keyof typeof MODELOS];

export const NOME_MODELO: Record<IdModelo, string> = {
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-haiku-5-5": "Claude Haiku 5.5",
};

/** Etapas configuráveis em Você › Configurações. */
export type EtapaModelo = "pesquisa" | "composicao" | "feynman" | "explicar" | "reparo";

export const MODELO_PADRAO: Record<EtapaModelo, IdModelo> = {
  pesquisa: MODELOS.sonnet,
  composicao: MODELOS.sonnet,
  feynman: MODELOS.sonnet,
  explicar: MODELOS.haiku,
  reparo: MODELOS.haiku,
};

export const MODELOS_PERMITIDOS: Record<EtapaModelo, IdModelo[]> = {
  pesquisa: [MODELOS.sonnet, MODELOS.opus], // a busca na web exige Sonnet ou Opus
  composicao: [MODELOS.sonnet, MODELOS.opus],
  feynman: [MODELOS.sonnet, MODELOS.opus, MODELOS.haiku],
  explicar: [MODELOS.haiku, MODELOS.sonnet],
  reparo: [MODELOS.haiku, MODELOS.sonnet],
};

export function modeloValido(etapa: EtapaModelo, modelo: string | null | undefined): IdModelo {
  return (MODELOS_PERMITIDOS[etapa] as string[]).includes(modelo ?? "") ? (modelo as IdModelo) : MODELO_PADRAO[etapa];
}

/** Beta do fallback do servidor quando o modelo recusa por política. */
export const BETA_FALLBACK = "server-side-fallback-2026-07-01";

/** Parâmetros de fallback: só para modelos que aceitam (Haiku 5.5 não tem). */
export function paramsFallback(modelo: string): { betas: string[]; fallbacks?: "default" } {
  return modelo === MODELOS.haiku ? { betas: [] } : { betas: [BETA_FALLBACK], fallbacks: "default" };
}

export const MAX_BUSCAS_PADRAO = 3;
export const TETO_MENSAL_PADRAO = 15;
export const LIMITE_DIARIO_PADRAO = 20;
