import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { erros } from "./erros";

let cliente: Anthropic | null = null;

/** A chave fica só no servidor (process.env.ANTHROPIC_API_KEY), nunca em NEXT_PUBLIC_* nem nos logs. */
export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function clienteIA(): Anthropic {
  if (!iaConfigurada()) throw erros.semChave();
  cliente ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  return cliente;
}
