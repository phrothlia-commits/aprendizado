import type { Agendador, Botao, EstadoAgendamento } from "./index";

const DIA_MS = 24 * 60 * 60 * 1000;

/** Nota SM-2 (q) de cada botão, conforme a tabela da seção 10. */
export const NOTA_SM2: Record<Botao, number> = { 1: 1, 2: 3, 3: 4, 4: 5 };

type EstadoSm2 = EstadoAgendamento & { algoritmo: "sm2"; ef: number; n: number; intervalo: number };

export function proximoSm2(
  atual: { ef: number; n: number; intervalo: number },
  q: number,
): { ef: number; n: number; intervalo: number } {
  let { n, intervalo } = atual;
  if (q < 3) {
    n = 0;
    intervalo = 1;
  } else {
    if (n === 0) intervalo = 1;
    else if (n === 1) intervalo = 6;
    else intervalo = Math.round(intervalo * atual.ef);
    n = n + 1;
  }
  const ef = Math.max(1.3, atual.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { ef, n, intervalo };
}

export const sm2Agendador: Agendador = {
  algoritmo: "sm2",
  novo() {
    return { algoritmo: "sm2", ef: 2.5, n: 0, intervalo: 0 } satisfies EstadoSm2;
  },
  revisar(estado, botao, agora) {
    const atual = estado as EstadoSm2;
    const prox = proximoSm2(atual, NOTA_SM2[botao]);
    return {
      estado: { algoritmo: "sm2", ...prox },
      proximaRevisao: new Date(agora.getTime() + prox.intervalo * DIA_MS),
      intervaloAnteriorDias: atual.intervalo,
      intervaloNovoDias: prox.intervalo,
    };
  },
};
