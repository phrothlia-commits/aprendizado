import { describe, expect, it } from "vitest";
import { formatarIntervalo, obterAgendador, previaIntervalos, revisarCartao, type Botao } from "./index";
import { proximoSm2 } from "./sm2";

const agora = new Date("2026-10-09T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;

describe("SM-2 (fallback)", () => {
  it("cartão novo começa com EF 2,5, n = 0, I = 0", () => {
    expect(obterAgendador("sm2").novo(agora)).toEqual({ algoritmo: "sm2", ef: 2.5, n: 0, intervalo: 0 });
  });

  it("segue a sequência 1, 6, I × EF com respostas boas", () => {
    let e = { ef: 2.5, n: 0, intervalo: 0 };
    e = proximoSm2(e, 4);
    expect(e.intervalo).toBe(1);
    e = proximoSm2(e, 4);
    expect(e.intervalo).toBe(6);
    e = proximoSm2(e, 4);
    expect(e.intervalo).toBe(15); // 6 × 2,5
    expect(e.n).toBe(3);
  });

  it("q < 3 zera repetições e volta para 1 dia", () => {
    const e = proximoSm2({ ef: 2.5, n: 4, intervalo: 40 }, 1);
    expect(e).toMatchObject({ n: 0, intervalo: 1 });
  });

  it("atualiza o EF pela fórmula e nunca fica abaixo de 1,3", () => {
    expect(proximoSm2({ ef: 2.5, n: 0, intervalo: 0 }, 5).ef).toBeCloseTo(2.6);
    expect(proximoSm2({ ef: 2.5, n: 0, intervalo: 0 }, 4).ef).toBeCloseTo(2.5);
    expect(proximoSm2({ ef: 2.5, n: 0, intervalo: 0 }, 3).ef).toBeCloseTo(2.36);
    expect(proximoSm2({ ef: 1.3, n: 0, intervalo: 0 }, 1).ef).toBe(1.3);
  });

  it("mapeia botões para notas 1/3/4/5", () => {
    const novo = obterAgendador("sm2").novo(agora);
    const errei = revisarCartao(novo, 1, agora, "sm2");
    const dificil = revisarCartao(novo, 2, agora, "sm2");
    expect((errei.estado as unknown as { ef: number }).ef).toBeCloseTo(1.96); // q = 1
    expect((dificil.estado as unknown as { ef: number }).ef).toBeCloseTo(2.36); // q = 3
    expect(errei.proximaRevisao.getTime() - agora.getTime()).toBe(DIA);
  });
});

describe("FSRS", () => {
  it("estado é JSON serializável e sobrevive a ida e volta", () => {
    const r = revisarCartao(null, 3, agora);
    const restaurado = JSON.parse(JSON.stringify(r.estado));
    const depois = new Date(r.proximaRevisao.getTime() + DIA);
    const r2 = revisarCartao(restaurado, 3, depois);
    expect(r2.proximaRevisao.getTime()).toBeGreaterThan(depois.getTime());
    expect(r2.estado.algoritmo).toBe("fsrs");
  });

  it("botões mais fáceis nunca geram intervalo menor", () => {
    let estado = revisarCartao(null, 3, agora).estado;
    let t = agora;
    for (let i = 0; i < 4; i++) {
      const r = revisarCartao(estado, 3, t);
      estado = r.estado;
      t = r.proximaRevisao;
    }
    const p = previaIntervalos(estado, t);
    expect(p[1]).toBeLessThanOrEqual(p[2]);
    expect(p[2]).toBeLessThanOrEqual(p[3]);
    expect(p[3]).toBeLessThanOrEqual(p[4]);
  });

  it("intervalos crescem com acertos consecutivos e caem após erro", () => {
    let estado = revisarCartao(null, 3, agora).estado;
    let t = agora;
    const intervalos: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = revisarCartao(estado, 3, t);
      intervalos.push(r.intervaloNovoDias);
      estado = r.estado;
      t = r.proximaRevisao;
    }
    expect(intervalos.at(-1)!).toBeGreaterThan(intervalos[1]);
    const erro = revisarCartao(estado, 1, t);
    expect(erro.intervaloNovoDias).toBeLessThan(1);
    expect(erro.intervaloAnteriorDias).toBeGreaterThan(1);
  });

  it("errar um cartão novo agenda para a mesma sessão (minutos)", () => {
    const r = revisarCartao(null, 1, agora);
    expect(r.intervaloNovoDias).toBeLessThan(1 / 24);
  });

  it("estado de outro algoritmo recomeça no algoritmo padrão", () => {
    const sm2 = obterAgendador("sm2").novo(agora);
    expect(revisarCartao(sm2, 3, agora, "fsrs").estado.algoritmo).toBe("fsrs");
  });
});

describe("formatarIntervalo", () => {
  it.each<[number, string]>([
    [1 / (24 * 60), "1 min"],
    [10 / (24 * 60), "10 min"],
    [0.25, "6 h"],
    [3, "3 d"],
    [60, "2 m"],
    [730, "2,0 a"],
  ])("%f dias → %s", (dias, texto) => {
    expect(formatarIntervalo(dias)).toBe(texto);
  });
});

it("todos os botões têm prévia", () => {
  const p = previaIntervalos(null, agora);
  for (const b of [1, 2, 3, 4] as Botao[]) expect(p[b]).toBeGreaterThan(0);
});
