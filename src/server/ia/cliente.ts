import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { erros } from "./erros";

export const MODELO = "claude-opus-5-5";

/** Fallback do servidor quando o modelo recusa por política (opt-in recomendado). */
export const BETAS_FALLBACK = ["server-side-fallback-2026-07-01"];

let cliente: Anthropic | null = null;

/** A chave fica só no servidor (process.env.ANTHROPIC_API_KEY), nunca em NEXT_PUBLIC_*. */
export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function clienteIA(): Anthropic {
  if (!iaConfigurada()) throw erros.semChave();
  cliente ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  return cliente;
}
