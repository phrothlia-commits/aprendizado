/**
 * Regras da tela "Hoje" (seções 7 e 9), sem banco nem interface,
 * para serem testadas isoladamente.
 */
import rotinaSeed from "../../seeds/rotina.json";
import { deDataLocal, diasEntre, somarDias } from "./datas";

export type ModoDia = "padrao" | "minimo";

export type ItemRotina = {
  id: string;
  momento: string;
  minutos: number;
  atividade: string;
  pilar: number | null;
  minimo: boolean;
  dias_semana?: number[];
};

export const ROTINA: ItemRotina[] = rotinaSeed.padrao;
export const ROTINA_SEMANAL: string[] = rotinaSeed.semanal;

/** Minutos de cada item no modo mínimo (sabedoria 10, revisão 15, diário 5 = 30). */
const MINUTOS_MINIMO: Record<string, number> = { sabedoria: 10, revisao: 15, diario: 5 };

export function itensDoDia(modo: ModoDia, data: string, rotina: ItemRotina[] = ROTINA): ItemRotina[] {
  const diaSemana = deDataLocal(data).getDay();
  if (modo === "minimo") {
    return rotina.filter((i) => i.minimo).map((i) => ({ ...i, minutos: MINUTOS_MINIMO[i.id] ?? i.minutos }));
  }
  return rotina.filter((i) => !i.dias_semana || i.dias_semana.includes(diaSemana));
}

// --- Sabedoria do dia --------------------------------------------------------

export type Passagem = { livro: "Provérbios" | "Salmos"; referencia: string; capitulos: number[] };

const DIAS_PROVERBIOS = 31;
const DIAS_SALMOS = 30;
const CICLO_SABEDORIA = DIAS_PROVERBIOS + DIAS_SALMOS;

/**
 * Rodízio: 31 dias de Provérbios (1 capítulo por dia), depois 30 dias de
 * Salmos (5 por dia, cobrindo os 150), e recomeça.
 */
export function sabedoriaDoDia(data: string, inicio: string = rotinaSeed.sabedoria.inicio): Passagem {
  const n = diasEntre(inicio, data);
  const pos = ((n % CICLO_SABEDORIA) + CICLO_SABEDORIA) % CICLO_SABEDORIA;
  if (pos < DIAS_PROVERBIOS) {
    const cap = pos + 1;
    return { livro: "Provérbios", referencia: `Provérbios ${cap}`, capitulos: [cap] };
  }
  const dia = pos - DIAS_PROVERBIOS; // 0..29
  const primeiro = dia * 5 + 1;
  const caps = [0, 1, 2, 3, 4].map((i) => primeiro + i);
  return { livro: "Salmos", referencia: `Salmos ${primeiro}–${primeiro + 4}`, capitulos: caps };
}

// --- Trimestre atual -----------------------------------------------------------

export type TrimestreBase = { data_inicio: string; data_fim: string; ordem: number };

export function trimestreAtual<T extends TrimestreBase>(trimestres: T[], data: string): { atual: T | null; proximo: T | null } {
  const ordenados = [...trimestres].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
  const atual = ordenados.find((t) => t.data_inicio <= data && data <= t.data_fim) ?? null;
  const proximo = ordenados.find((t) => t.data_inicio > data) ?? null;
  return { atual, proximo };
}

// --- Sequência -------------------------------------------------------------------

/**
 * Dias seguidos com atividade. Se hoje ainda não teve atividade, a sequência
 * de ontem continua valendo (o dia ainda não acabou).
 */
export function calcularSequencia(diasAtivos: Iterable<string>, hoje: string): { dias: number; hojeConta: boolean } {
  const set = new Set(diasAtivos);
  const hojeConta = set.has(hoje);
  let d = hojeConta ? hoje : somarDias(hoje, -1);
  let dias = 0;
  while (set.has(d)) {
    dias++;
    d = somarDias(d, -1);
  }
  return { dias, hojeConta };
}

// --- Resumo do dia -------------------------------------------------------------------

/** Segundos médios por cartão, para estimar o tempo da revisão. */
export const SEGUNDOS_POR_CARTAO = 10;

export function minutosRevisao(cartoes: number): number {
  return Math.ceil((cartoes * SEGUNDOS_POR_CARTAO) / 60);
}

export type ResumoHoje = {
  itens: (ItemRotina & { feito: boolean })[];
  minutosTotais: number;
  minutosRestantes: number;
  progresso: number; // 0..1
};

/**
 * Junta rotina, checklist salvo e estado real (revisões zeradas, diário escrito)
 * para marcar automaticamente o que já foi feito.
 */
export function montarResumo(params: {
  modo: ModoDia;
  data: string;
  checklist: Record<string, boolean>;
  cartoesPendentes: number;
  revisoesHoje: number;
  diarioCompleto: boolean;
}): ResumoHoje {
  const { modo, data, checklist, cartoesPendentes, revisoesHoje, diarioCompleto } = params;
  const automaticos: Record<string, boolean> = {
    revisao: cartoesPendentes === 0 && revisoesHoje > 0,
    diario: diarioCompleto,
  };
  const itens = itensDoDia(modo, data).map((i) => ({ ...i, feito: Boolean(checklist[i.id] || automaticos[i.id]) }));
  const minutosTotais = itens.reduce((s, i) => s + i.minutos, 0);
  const minutosRestantes = itens.filter((i) => !i.feito).reduce((s, i) => s + i.minutos, 0);
  return {
    itens,
    minutosTotais,
    minutosRestantes,
    progresso: minutosTotais ? (minutosTotais - minutosRestantes) / minutosTotais : 0,
  };
}
