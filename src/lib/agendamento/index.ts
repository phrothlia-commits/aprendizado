/**
 * Camada de agendamento (seção 10 da especificação).
 *
 * Isolada de interface e de banco: recebe o estado salvo do cartão (JSON),
 * a data atual e o botão escolhido, e devolve o novo estado e a próxima
 * revisão. Permite trocar FSRS por SM-2 sem mexer nas telas.
 */
import { fsrsAgendador } from "./fsrs";
import { sm2Agendador } from "./sm2";

export type Botao = 1 | 2 | 3 | 4; // Errei | Difícil | Bom | Fácil
export const BOTOES: { valor: Botao; rotulo: string; dica: string }[] = [
  { valor: 1, rotulo: "Errei", dica: "Não lembrei" },
  { valor: 2, rotulo: "Difícil", dica: "Lembrei com muito esforço" },
  { valor: 3, rotulo: "Bom", dica: "Lembrei com esforço normal" },
  { valor: 4, rotulo: "Fácil", dica: "Lembrei na hora" },
];

export type Algoritmo = "fsrs" | "sm2";

/** Estado serializável guardado em `cartoes.agendamento`. */
export type EstadoAgendamento = { algoritmo: Algoritmo; [k: string]: unknown };

export type ResultadoRevisao = {
  estado: EstadoAgendamento;
  proximaRevisao: Date;
  /** Intervalo em dias antes desta revisão (0 para cartão novo). */
  intervaloAnteriorDias: number;
  /** Intervalo em dias até a próxima revisão (pode ser fracionário em passos de aprendizado). */
  intervaloNovoDias: number;
};

export interface Agendador {
  algoritmo: Algoritmo;
  novo(agora: Date): EstadoAgendamento;
  revisar(estado: EstadoAgendamento, botao: Botao, agora: Date): ResultadoRevisao;
}

const agendadores: Record<Algoritmo, Agendador> = {
  fsrs: fsrsAgendador,
  sm2: sm2Agendador,
};

export function obterAgendador(algoritmo: Algoritmo): Agendador {
  return agendadores[algoritmo];
}

/**
 * Revisa usando o algoritmo do estado salvo. Se o usuário trocou o algoritmo
 * padrão, cartões sem estado (novos) ou de outro algoritmo recomeçam no novo.
 */
export function revisarCartao(
  estado: EstadoAgendamento | null | undefined,
  botao: Botao,
  agora: Date,
  algoritmoPadrao: Algoritmo = "fsrs",
): ResultadoRevisao {
  const ag =
    estado && estado.algoritmo === algoritmoPadrao
      ? agendadores[estado.algoritmo]
      : agendadores[algoritmoPadrao];
  const base = estado && estado.algoritmo === ag.algoritmo ? estado : ag.novo(agora);
  return ag.revisar(base, botao, agora);
}

/** Prévia dos intervalos de cada botão, para mostrar abaixo dos botões. */
export function previaIntervalos(
  estado: EstadoAgendamento | null | undefined,
  agora: Date,
  algoritmoPadrao: Algoritmo = "fsrs",
): Record<Botao, number> {
  const r = {} as Record<Botao, number>;
  for (const b of BOTOES) r[b.valor] = revisarCartao(estado, b.valor, agora, algoritmoPadrao).intervaloNovoDias;
  return r;
}

export function formatarIntervalo(dias: number): string {
  const min = Math.round(dias * 24 * 60);
  if (min < 60) return `${Math.max(1, min)} min`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h`;
  const d = Math.round(dias);
  if (d < 30) return `${d} d`;
  if (d < 365) return `${Math.round(d / 30)} m`;
  return `${(d / 365).toFixed(1).replace(".", ",")} a`;
}
