import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

/** Lê um prompt de sistema de /prompts (incluído no deploy via outputFileTracingIncludes). */
export function prompt(nome: "aula-pesquisa" | "aula-composicao" | "feynman" | "busca-pdf"): string {
  let texto = cache.get(nome);
  if (!texto) {
    texto = readFileSync(path.join(process.cwd(), "prompts", `${nome}.md`), "utf8");
    cache.set(nome, texto);
  }
  return texto;
}
