import Papa from "papaparse";

export type LinhaImportacao = { frente: string; verso: string; pilar: number | null; tags: string[] };

/**
 * Lê o CSV de importação de cartões: colunas frente, verso, pilar, tags
 * (tags separadas por ';'). Linhas sem frente ou verso são reportadas como erro.
 */
export function lerCsvCartoes(texto: string): { linhas: LinhaImportacao[]; erros: string[] } {
  const r = Papa.parse<Record<string, string>>(texto.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const erros: string[] = r.errors.map((e) => `Linha ${(e.row ?? 0) + 2}: ${e.message}`);
  const linhas: LinhaImportacao[] = [];
  r.data.forEach((l, i) => {
    const frente = (l.frente ?? "").trim();
    const verso = (l.verso ?? "").trim();
    if (!frente || !verso) {
      erros.push(`Linha ${i + 2}: frente e verso são obrigatórios`);
      return;
    }
    const pilarTxt = (l.pilar ?? "").trim();
    const pilar = pilarTxt === "" ? null : Number(pilarTxt);
    if (pilar !== null && !Number.isInteger(pilar)) {
      erros.push(`Linha ${i + 2}: pilar deve ser um número (1 a 8)`);
      return;
    }
    const tags = (l.tags ?? "")
      .split(/[;,]/)
      .map((t) => t.trim())
      .filter(Boolean);
    linhas.push({ frente, verso, pilar, tags });
  });
  return { linhas, erros };
}

/** Converte linhas em CSV; arrays viram texto separado por ';' e objetos viram JSON. */
export function paraCsv(linhas: Record<string, unknown>[]): string {
  const dados = linhas.map((l) =>
    Object.fromEntries(
      Object.entries(l).map(([k, v]) => [
        k,
        Array.isArray(v) ? v.join(";") : v !== null && typeof v === "object" ? JSON.stringify(v) : v,
      ]),
    ),
  );
  // BOM para o Excel abrir acentos corretamente.
  return "﻿" + Papa.unparse(dados);
}

export function baixarArquivo(nome: string, conteudo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
