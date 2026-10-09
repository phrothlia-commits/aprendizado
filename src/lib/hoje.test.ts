import { describe, expect, it } from "vitest";
import { calcularSequencia, itensDoDia, minutosRevisao, montarResumo, sabedoriaDoDia, trimestreAtual } from "./hoje";
import { montarFila } from "./fila";

describe("rotina do dia", () => {
  it("modo mínimo tem ~30 min: sabedoria, revisão e diário", () => {
    const itens = itensDoDia("minimo", "2026-10-09");
    expect(itens.map((i) => i.id)).toEqual(["sabedoria", "revisao", "diario"]);
    expect(itens.reduce((s, i) => s + i.minutos, 0)).toBe(30);
  });

  it("trilha paralela só aparece nos dias dela (terça, quinta e sábado)", () => {
    expect(itensDoDia("padrao", "2026-10-06").some((i) => i.id === "paralela")).toBe(true); // terça
    expect(itensDoDia("padrao", "2026-10-09").some((i) => i.id === "paralela")).toBe(false); // sexta
  });

  it("modo padrão usa os tempos mínimos da tabela: 95 min, 125 com a paralela", () => {
    const soma = (d: string) => itensDoDia("padrao", d).reduce((s, i) => s + i.minutos, 0);
    expect(soma("2026-10-09")).toBe(95);
    expect(soma("2026-10-06")).toBe(125);
  });
});

describe("sabedoria do dia", () => {
  it("começa em Provérbios 1 e segue 1 capítulo por dia", () => {
    expect(sabedoriaDoDia("2026-10-01").referencia).toBe("Provérbios 1");
    expect(sabedoriaDoDia("2026-10-31").referencia).toBe("Provérbios 31");
  });

  it("depois de 31 dias passa para Salmos, 5 por dia, até o 150", () => {
    expect(sabedoriaDoDia("2026-11-01").referencia).toBe("Salmos 1–5");
    expect(sabedoriaDoDia("2026-11-30").referencia).toBe("Salmos 146–150");
  });

  it("o rodízio recomeça a cada 61 dias", () => {
    expect(sabedoriaDoDia("2026-12-01").referencia).toBe("Provérbios 1");
  });
});

describe("trimestre atual", () => {
  const ts = [
    { ordem: 1, data_inicio: "2026-10-01", data_fim: "2026-12-31" },
    { ordem: 2, data_inicio: "2027-01-01", data_fim: "2027-03-31" },
  ];
  it("encontra o atual e o próximo", () => {
    const r = trimestreAtual(ts, "2026-10-09");
    expect(r.atual?.ordem).toBe(1);
    expect(r.proximo?.ordem).toBe(2);
  });
  it("último dia ainda pertence ao trimestre", () => {
    expect(trimestreAtual(ts, "2026-12-31").atual?.ordem).toBe(1);
  });
  it("fora do ciclo retorna nulo", () => {
    expect(trimestreAtual(ts, "2030-01-01").atual).toBeNull();
  });
});

describe("sequência", () => {
  it("conta dias seguidos até hoje", () => {
    expect(calcularSequencia(["2026-10-09", "2026-10-08", "2026-10-07", "2026-10-05"], "2026-10-09")).toEqual({ dias: 3, hojeConta: true });
  });
  it("se hoje ainda não teve atividade, mantém a de ontem", () => {
    expect(calcularSequencia(["2026-10-08", "2026-10-07"], "2026-10-09")).toEqual({ dias: 2, hojeConta: false });
  });
  it("um dia sem atividade quebra a sequência", () => {
    expect(calcularSequencia(["2026-10-07"], "2026-10-09").dias).toBe(0);
  });
  it("atravessa a virada do mês", () => {
    expect(calcularSequencia(["2026-11-01", "2026-10-31", "2026-10-30"], "2026-11-01").dias).toBe(3);
  });
});

describe("resumo do dia", () => {
  it("marca revisão e diário automaticamente quando concluídos", () => {
    const r = montarResumo({
      modo: "minimo",
      data: "2026-10-09",
      checklist: {},
      cartoesPendentes: 0,
      revisoesHoje: 20,
      diarioCompleto: true,
    });
    expect(r.itens.filter((i) => i.feito).map((i) => i.id)).toEqual(["revisao", "diario"]);
    expect(r.minutosRestantes).toBe(10);
  });

  it("não marca revisão se nada foi revisado", () => {
    const r = montarResumo({ modo: "padrao", data: "2026-10-09", checklist: { sabedoria: true }, cartoesPendentes: 0, revisoesHoje: 0, diarioCompleto: false });
    expect(r.itens.find((i) => i.id === "revisao")?.feito).toBe(false);
    expect(r.itens.find((i) => i.id === "sabedoria")?.feito).toBe(true);
    expect(r.progresso).toBeGreaterThan(0);
  });

  it("estima ~10 s por cartão", () => {
    expect(minutosRevisao(90)).toBe(15);
    expect(minutosRevisao(0)).toBe(0);
  });
});

describe("fila de revisão", () => {
  const c = (id: string, pilar: string, venc: string | null, pos: number) => ({ id, pilar_id: pilar, proxima_revisao: venc, posicao: pos });
  const vencidos = [c("v1", "A", "2026-10-01", 1), c("v2", "A", "2026-10-02", 2), c("v3", "B", "2026-10-03", 3)];
  const novos = [c("n1", "A", null, 10), c("n2", "A", null, 11), c("n3", "B", null, 12)];

  it("vencidos vêm antes dos novos e são intercalados por pilar", () => {
    const { fila } = montarFila({ vencidos, novos, limiteRevisoes: 150, limiteNovos: 10, revisoesFeitasHoje: 0, novosFeitosHoje: 0 });
    expect(fila.map((x) => x.id)).toEqual(["v1", "v3", "v2", "n1", "n3", "n2"]);
  });

  it("respeita o limite de novos já estudados hoje", () => {
    const { fila } = montarFila({ vencidos: [], novos, limiteRevisoes: 150, limiteNovos: 10, revisoesFeitasHoje: 0, novosFeitosHoje: 9 });
    expect(fila.map((x) => x.id)).toEqual(["n1"]);
  });

  it("limite de revisões corta primeiro os novos e depois os menos atrasados", () => {
    const { fila } = montarFila({ vencidos, novos, limiteRevisoes: 2, limiteNovos: 10, revisoesFeitasHoje: 0, novosFeitosHoje: 0 });
    expect(fila.map((x) => x.id).sort()).toEqual(["v1", "v2"]);
  });

  it("filtra por pilar", () => {
    const { fila } = montarFila({ vencidos, novos, limiteRevisoes: 150, limiteNovos: 10, revisoesFeitasHoje: 0, novosFeitosHoje: 0, pilarId: "B" });
    expect(fila.map((x) => x.id)).toEqual(["v3", "n3"]);
  });
});
