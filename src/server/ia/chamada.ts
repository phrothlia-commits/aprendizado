/**
 * Toda chamada à API passa por aqui: confere limite diário e teto mensal ANTES de
 * chamar, aplica o modelo e o fallback certos, mede a duração e registra custo,
 * cache e erro detalhado em ia_chamadas.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { calcularCusto, economiaCache, resumirUso } from "./custos";
import { classificarErro, comEtapa, erros, ErroApp, type Etapa } from "./erros";
import { paramsFallback } from "./modelos";
import type { Deps, Mensagem, Params } from "./tipos";

/** Bloqueia antes de gastar: limite diário de chamadas e teto mensal em dólares. */
export async function garantirOrcamento(deps: Deps, chamadas = 1) {
  const [cfg, uso] = await Promise.all([deps.repo.config(), deps.repo.consumo()]);
  if (uso.chamadasHoje + chamadas > cfg.limiteDiario) throw erros.limiteDiario(cfg.limiteDiario);
  if (cfg.tetoMensal >= 0 && uso.custoMes >= cfg.tetoMensal) throw erros.tetoMensal(cfg.tetoMensal);
}

export type PedidoIA = {
  etapa: Etapa;
  funcao: string;
  modelo: string;
  params: Omit<Params, "model" | "betas">;
  geracaoId?: string | null;
  aoTexto?: (caracteres: number) => void;
};

/** Uma chamada à API, com orçamento, registro e erro classificado pela etapa. */
export async function chamarIA(deps: Deps, p: PedidoIA): Promise<{ mensagem: Mensagem; custo: number }> {
  await garantirOrcamento(deps, 1).catch((e) => {
    throw comEtapa(e, p.etapa, p.modelo);
  });
  const fb = paramsFallback(p.modelo);
  const inicio = Date.now();
  let mensagem: Mensagem;
  try {
    mensagem = await deps.ia.chamar(
      { ...p.params, model: p.modelo, betas: fb.betas, ...(fb.fallbacks ? { fallbacks: fb.fallbacks } : {}) } as Params,
      p.aoTexto ? { aoTexto: p.aoTexto } : undefined,
    );
  } catch (e) {
    const c = classificarErro(e, p.etapa, p.modelo);
    console.error("[ia] chamada falhou", JSON.stringify(c.detalhe));
    await deps.repo.registrarChamada({
      funcao: p.funcao,
      etapa: p.etapa,
      modelo: p.modelo,
      input_tokens: 0,
      output_tokens: 0,
      cache_leitura_tokens: 0,
      cache_escrita_tokens: 0,
      buscas_web: 0,
      custo_usd: 0,
      economia_usd: 0,
      duracao_ms: Date.now() - inicio,
      sucesso: false,
      erro: c.codigo,
      erro_detalhe: c.detalhe,
      reaproveitado: false,
      geracao_id: p.geracaoId ?? null,
    });
    throw comEtapa(e, p.etapa, p.modelo);
  }
  const modelo = mensagem.model ?? p.modelo;
  const custo = calcularCusto(modelo, mensagem.usage);
  const recusou = mensagem.stop_reason === "refusal";
  await deps.repo.registrarChamada({
    funcao: p.funcao,
    etapa: p.etapa,
    modelo,
    ...resumirUso(mensagem.usage),
    custo_usd: custo,
    economia_usd: economiaCache(modelo, mensagem.usage),
    duracao_ms: Date.now() - inicio,
    sucesso: !recusou,
    erro: recusou ? "recusa" : null,
    erro_detalhe: recusou
      ? { etapa: p.etapa, modelo, status: 200, tipo: "refusal", mensagem: String(mensagem.stop_details?.category ?? "sem categoria"), request_id: mensagem.id }
      : null,
    reaproveitado: false,
    geracao_id: p.geracaoId ?? null,
  });
  if (recusou) throw comEtapa(erros.recusa(), p.etapa, modelo);
  return { mensagem, custo };
}

/** Registro de uma etapa resolvida sem chamar a API (checkpoint ou cache): não conta no limite. */
export async function registrarReaproveitamento(deps: Deps, r: { funcao: string; etapa: Etapa; economia: number; geracaoId: string | null }) {
  await deps.repo.registrarChamada({
    funcao: r.funcao,
    etapa: r.etapa,
    modelo: "-",
    input_tokens: 0,
    output_tokens: 0,
    cache_leitura_tokens: 0,
    cache_escrita_tokens: 0,
    buscas_web: 0,
    custo_usd: 0,
    economia_usd: Math.round(r.economia * 10000) / 10000,
    duracao_ms: 0,
    sucesso: true,
    erro: null,
    erro_detalhe: null,
    reaproveitado: true,
    geracao_id: r.geracaoId,
  });
}

export function textoDe(m: Mensagem): string {
  return m.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

function problemasDeValidacao(erro: z.ZodError): string {
  return erro.issues
    .slice(0, 30)
    .map((i) => `- ${i.path.join(".") || "(raiz)"}: ${i.message}`)
    .join("\n");
}

type Validado<T> = { ok: true; dados: T } | { ok: false; problemas: string };

function validar<T>(esquema: z.ZodType<T>, texto: string): Validado<T> {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch (e) {
    return { ok: false, problemas: `- JSON inválido: ${(e as Error).message}` };
  }
  const r = esquema.safeParse(json);
  return r.success ? { ok: true, dados: r.data } : { ok: false, problemas: problemasDeValidacao(r.error) };
}

export type PedidoJson<T> = {
  etapa: Etapa;
  funcao: string;
  modelo: string;
  /** Modelo da chamada de reparo do JSON (padrão: Haiku). */
  modeloReparo: string;
  esquema: z.ZodType<T>;
  system: Anthropic.Beta.BetaTextBlockParam[];
  mensagens: Anthropic.Beta.BetaMessageParam[];
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens: number;
  geracaoId?: string | null;
  aoTexto?: (caracteres: number) => void;
};

/**
 * Chamada com saída estruturada (output_config.format) e validação zod no servidor.
 * Se a resposta não validar, faz NO MÁXIMO UMA chamada de reparo, enviando só os
 * erros de validação e o JSON recebido.
 */
export async function chamarJson<T>(deps: Deps, p: PedidoJson<T>): Promise<{ dados: T; custo: number }> {
  const { betaZodOutputFormat } = await import("@anthropic-ai/sdk/helpers/beta/zod");
  const formato = betaZodOutputFormat(p.esquema as never);
  const { mensagem, custo } = await chamarIA(deps, {
    etapa: p.etapa,
    funcao: p.funcao,
    modelo: p.modelo,
    geracaoId: p.geracaoId,
    aoTexto: p.aoTexto,
    params: {
      max_tokens: p.maxTokens,
      system: p.system,
      messages: p.mensagens,
      output_config: { effort: p.effort, format: formato },
    } as Omit<Params, "model" | "betas">,
  });
  const recebido = textoDe(mensagem);
  const v = validar(p.esquema, recebido);
  if (v.ok) return { dados: v.dados, custo };

  const reparo = await chamarIA(deps, {
    etapa: "reparo",
    funcao: `${p.funcao}_reparo`,
    modelo: p.modeloReparo,
    geracaoId: p.geracaoId,
    params: {
      max_tokens: p.maxTokens,
      system: deps.prompts("reparo-json"),
      messages: [
        {
          role: "user",
          content: `## Erros de validação\n${v.problemas}\n\n## JSON recebido${mensagem.stop_reason === "max_tokens" ? " (cortado no limite de tamanho)" : ""}\n${recebido}`,
        },
      ],
      output_config: { effort: "low", format: formato },
    } as Omit<Params, "model" | "betas">,
  });
  const v2 = validar(p.esquema, textoDe(reparo.mensagem));
  if (v2.ok) return { dados: v2.dados, custo: custo + reparo.custo };
  const erro = erros.respostaInvalida(v2.problemas);
  throw new ErroApp(erro.codigo, erro.status, erro.message, p.etapa, erro.detalhe ? { ...erro.detalhe, etapa: p.etapa, modelo: p.modelo } : null);
}
