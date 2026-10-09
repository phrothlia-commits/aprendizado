import { describe, expect, it } from "vitest";
import { intercalar, montarSeed } from "./seed";

describe("seed", () => {
  let n = 0;
  const seed = montarSeed(() => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`);

  it("tem os 8 pilares mais a base física", () => {
    expect(seed.pilares.map((p) => p.numero).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("todo tema, recurso, trimestre e cartão aponta para ids existentes", () => {
    const pilares = new Set(seed.pilares.map((p) => p.id));
    const temas = new Set(seed.temas.map((t) => t.id));
    for (const t of seed.temas) expect(pilares.has(t.pilar_id)).toBe(true);
    for (const r of seed.recursos) {
      expect(pilares.has(r.pilar_id)).toBe(true);
      expect(temas.has(r.tema_id)).toBe(true);
    }
    for (const t of seed.trimestres) {
      expect(temas.has(t.tema_nucleo_id)).toBe(true);
      expect(temas.has(t.tema_paralelo_id)).toBe(true);
    }
    for (const c of seed.cartoes) expect(temas.has(c.tema_id)).toBe(true);
  });

  it("ciclo 1 tem 8 trimestres contíguos de out/2026 a set/2028", () => {
    expect(seed.trimestres).toHaveLength(8);
    expect(seed.trimestres[0].data_inicio).toBe("2026-10-01");
    expect(seed.trimestres[7].data_fim).toBe("2028-09-30");
    for (let i = 1; i < 8; i++) {
      const fimAnterior = new Date(seed.trimestres[i - 1].data_fim + "T00:00:00Z");
      const inicio = new Date(seed.trimestres[i].data_inicio + "T00:00:00Z");
      expect(inicio.getTime() - fimAnterior.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("inclui os 16 cartões da CF/88 e os de inglês, intercalados", () => {
    const cf = seed.cartoes.filter((c) => c.tags.includes("cf88"));
    expect(cf).toHaveLength(16);
    expect(seed.cartoes.filter((c) => c.tipo === "idioma").length).toBeGreaterThanOrEqual(100);
    expect(seed.cartoes[0].tags).toContain("cf88");
    expect(seed.cartoes[1].tags).toContain("ingles");
  });

  it("6 idiomas, inglês ativo", () => {
    expect(seed.idiomas).toHaveLength(6);
    expect(seed.idiomas.find((i) => i.nome === "Inglês")?.status).toBe("ativo");
  });

  it("slugs de tema são únicos", () => {
    const slugs = seed.temas.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

it("intercalar alterna listas de tamanhos diferentes", () => {
  expect(intercalar<number | string>([[1, 2, 3], ["a"]])).toEqual([1, "a", 2, 3]);
});
