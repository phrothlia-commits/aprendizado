import { expect, it } from "vitest";
import { lerCsvCartoes, paraCsv } from "./csv";

it("lê o formato da seção 15 (frente, verso, pilar, tags com ';')", () => {
  const csv = `frente,verso,pilar,tags
"Quando foi promulgada a Constituição Federal atual?","5 de outubro de 1988",4,cf88
"O que compõe o Congresso Nacional (art. 44)?","Câmara dos Deputados e Senado Federal",4,cf88;tres-poderes`;
  const { linhas, erros } = lerCsvCartoes(csv);
  expect(erros).toEqual([]);
  expect(linhas).toHaveLength(2);
  expect(linhas[1]).toEqual({
    frente: "O que compõe o Congresso Nacional (art. 44)?",
    verso: "Câmara dos Deputados e Senado Federal",
    pilar: 4,
    tags: ["cf88", "tres-poderes"],
  });
});

it("aceita BOM, cabeçalho em maiúsculas e pilar vazio", () => {
  const { linhas } = lerCsvCartoes("﻿Frente,Verso,Pilar,Tags\nA,B,,\n");
  expect(linhas).toEqual([{ frente: "A", verso: "B", pilar: null, tags: [] }]);
});

it("reporta linhas inválidas sem descartar as válidas", () => {
  const { linhas, erros } = lerCsvCartoes("frente,verso,pilar,tags\nA,,1,\nC,D,x,\nE,F,2,t");
  expect(linhas.map((l) => l.frente)).toEqual(["E"]);
  expect(erros).toHaveLength(2);
});

it("exporta e reimporta sem perder dados", () => {
  const csv = paraCsv([{ frente: 'Ele disse "oi", e saiu', verso: "linha 1\nlinha 2", pilar: 2, tags: ["a", "b"] }]);
  const { linhas } = lerCsvCartoes(csv);
  expect(linhas[0]).toEqual({ frente: 'Ele disse "oi", e saiu', verso: "linha 1\nlinha 2", pilar: 2, tags: ["a", "b"] });
});
