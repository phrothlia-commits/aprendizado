/**
 * Busca de fontes legais com a ferramenta de busca na web da API do Claude.
 * Só são aproveitados links que (1) vieram dos resultados da busca, (2) estão na
 * lista de domínios legais e (3) responderam à verificação no servidor.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { classificarFonte, DOMINIOS_BUSCA, REGRAS } from "../fontes/dominios";
import { verificarLinks } from "../fontes/verificar";
import { chamarIA } from "./chamada";
import { dominiosInacessiveis, type Etapa } from "./erros";
import type { FonteVerificada } from "./schemas";
import type { Deps, Mensagem, Params } from "./tipos";

export type ResultadoBusca = { url: string; titulo: string };

/** Extrai URLs e títulos dos resultados da busca e das citações do texto. */
export function extrairResultados(mensagens: Mensagem[]): ResultadoBusca[] {
  const vistos = new Map<string, ResultadoBusca>();
  for (const m of mensagens) {
    for (const bloco of m.content) {
      if (bloco.type === "web_search_tool_result" && Array.isArray(bloco.content)) {
        for (const r of bloco.content) if (r.type === "web_search_result" && !vistos.has(r.url)) vistos.set(r.url, { url: r.url, titulo: r.title });
      }
      if (bloco.type === "text" && bloco.citations) {
        for (const c of bloco.citations) {
          if (c.type === "web_search_result_location" && !vistos.has(c.url)) vistos.set(c.url, { url: c.url, titulo: c.title ?? c.url });
        }
      }
    }
  }
  return [...vistos.values()];
}

/** Classifica, descarta o que não é legal e verifica se cada link responde. */
export async function filtrarEVerificar(
  resultados: ResultadoBusca[],
  opcoes: { somenteDownload?: boolean; maximo?: number; fetch?: typeof fetch } = {},
): Promise<{ fontes: FonteVerificada[]; descartadas: number }> {
  const candidatas = resultados
    .map((r) => ({ r, c: classificarFonte(r.url) }))
    .filter((x): x is { r: ResultadoBusca; c: NonNullable<ReturnType<typeof classificarFonte>> } => x.c !== null)
    .filter((x) => !opcoes.somenteDownload || x.c.permiteDownload)
    .slice(0, (opcoes.maximo ?? 12) * 2);
  const verificacao = await verificarLinks(
    candidatas.map((x) => x.r.url),
    { fetch: opcoes.fetch },
  );
  const fontes = candidatas
    .filter((x) => verificacao.get(x.r.url)?.ok)
    .slice(0, opcoes.maximo ?? 12)
    .map((x, i) => ({
      id: `S${i + 1}`,
      url: x.r.url,
      titulo: x.r.titulo.trim() || x.c.host,
      tipo: x.c.tipo,
      categoria: x.c.categoria,
      acesso: x.c.acesso,
      gratuita: x.c.gratuita,
      permiteDownload: x.c.permiteDownload,
    }));
  return { fontes, descartadas: resultados.length - fontes.length };
}

export const DOMINIOS_DOWNLOAD = [...new Set(REGRAS.filter((r) => r.permiteDownload).map((r) => r.dominio))];

/** Lista para `allowed_domains`: a lista base menos os domínios que a busca já recusou. */
export function dominiosParaBusca(base: string[], bloqueados: string[]): string[] {
  const fora = new Set(bloqueados.map((d) => d.toLowerCase()));
  return base.filter((d) => !fora.has(d));
}

export type PedidoBusca = {
  etapa: Etapa;
  funcao: string;
  modelo: string;
  sistema: string;
  pedido: string;
  /** Lista base de domínios permitidos (padrão: DOMINIOS_BUSCA). */
  dominios?: string[];
  maxBuscas: number;
  geracaoId?: string | null;
};

/**
 * Executa a busca na web (retomando `pause_turn`) e devolve as mensagens e o custo.
 * Sempre envia `allowed_domains`. Se a API recusar a busca porque algum domínio da
 * lista é inacessível (erro 400), registra esses domínios, tira-os da lista e tenta
 * de novo UMA vez.
 */
export async function buscarNaWeb(deps: Deps, p: PedidoBusca): Promise<{ respostas: Mensagem[]; custo: number }> {
  let dominios = dominiosParaBusca(p.dominios ?? DOMINIOS_BUSCA, await deps.repo.dominiosBloqueados());
  const mensagens: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: p.pedido }];
  const respostas: Mensagem[] = [];
  let custo = 0;
  let jaRetirou = false;
  for (let volta = 0; volta < 3; ) {
    const params = {
      max_tokens: 8000,
      output_config: { effort: "medium" },
      // Parte fixa primeiro (ferramenta + sistema) e marcada para cache.
      system: [{ type: "text", text: p.sistema, cache_control: { type: "ephemeral" } }],
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: p.maxBuscas,
          allowed_domains: dominios,
          user_location: { type: "approximate", country: "BR", timezone: "America/Sao_Paulo" },
        },
      ],
      messages: mensagens,
    } as Omit<Params, "model" | "betas">;
    let r: { mensagem: Mensagem; custo: number };
    try {
      r = await chamarIA(deps, { etapa: p.etapa, funcao: p.funcao, modelo: p.modelo, geracaoId: p.geracaoId, params });
    } catch (e) {
      const recusados = jaRetirou ? [] : dominiosInacessiveis(e, dominios);
      if (!recusados.length) throw e;
      jaRetirou = true;
      await deps.repo.registrarDominiosBloqueados(recusados);
      console.error("[ia] busca recusou domínios; nova tentativa sem eles:", recusados.join(", "));
      dominios = dominios.filter((d) => !recusados.includes(d));
      continue;
    }
    custo += r.custo;
    respostas.push(r.mensagem);
    volta++;
    if (r.mensagem.stop_reason !== "pause_turn") break;
    mensagens.push({ role: "assistant", content: r.mensagem.content as Anthropic.Beta.BetaContentBlockParam[] });
  }
  return { respostas, custo };
}
