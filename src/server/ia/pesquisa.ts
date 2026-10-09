/**
 * Busca de fontes legais com a ferramenta de busca na web da API do Claude.
 * Só são aproveitados links que (1) vieram dos resultados da busca, (2) estão na
 * lista de domínios legais e (3) responderam à verificação no servidor.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { classificarFonte, DOMINIOS_BUSCA, REGRAS } from "../fontes/dominios";
import { verificarLinks } from "../fontes/verificar";
import type { FonteVerificada } from "./schemas";

type Mensagem = Anthropic.Beta.BetaMessage;
type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;

/** Porta para a API: em produção usa o SDK; nos testes, um dublê. */
export type PortaIA = { chamar(params: Params): Promise<Mensagem> };

export type ChamadaRegistrada = { funcao: string; mensagem: Mensagem | null; erro?: unknown };

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

/**
 * Executa a busca na web (retomando `pause_turn`) e devolve as mensagens.
 * `registrar` recebe cada chamada para o log de custos.
 */
export async function buscarNaWeb(
  ia: PortaIA,
  params: { sistema: string; pedido: string; dominios?: string[]; maxBuscas?: number; modelo: string; betas: string[] },
  registrar: (c: ChamadaRegistrada) => Promise<void>,
  funcao: string,
): Promise<Mensagem[]> {
  const mensagens: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: params.pedido }];
  const respostas: Mensagem[] = [];
  for (let volta = 0; volta < 3; volta++) {
    let resposta: Mensagem;
    try {
      resposta = await ia.chamar({
        model: params.modelo,
        max_tokens: 8000,
        betas: params.betas,
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: params.sistema,
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: params.maxBuscas ?? 6,
            allowed_domains: params.dominios ?? DOMINIOS_BUSCA,
            user_location: { type: "approximate", country: "BR", timezone: "America/Sao_Paulo" },
          },
        ],
        messages: mensagens,
      } as Params);
    } catch (erro) {
      await registrar({ funcao, mensagem: null, erro });
      throw erro;
    }
    await registrar({ funcao, mensagem: resposta });
    respostas.push(resposta);
    if (resposta.stop_reason !== "pause_turn") break;
    mensagens.push({ role: "assistant", content: resposta.content as Anthropic.Beta.BetaContentBlockParam[] });
  }
  return respostas;
}
