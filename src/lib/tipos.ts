import type { Algoritmo, EstadoAgendamento } from "./agendamento";
import type { ModoDia } from "./hoje";

type Base = { id: string; created_at: string; updated_at: string };

export type Configuracoes = { novos_por_dia: number; revisoes_por_dia: number; algoritmo: Algoritmo };

export type Pilar = Base & {
  numero: number;
  slug: string;
  nome: string;
  prioridade: "A" | "B" | "C" | "continua";
  cor: string | null;
  descricao: string | null;
};

export type Nivel = "fundamentos" | "intermediario" | "avancado";
export const NIVEIS: { valor: Nivel; rotulo: string }[] = [
  { valor: "fundamentos", rotulo: "Fundamentos" },
  { valor: "intermediario", rotulo: "Intermediário" },
  { valor: "avancado", rotulo: "Avançado" },
];

export type StatusTema = "fila" | "ativo" | "concluido_no_nivel";
export const STATUS_TEMA: Record<StatusTema, string> = {
  fila: "Na fila",
  ativo: "Ativo",
  concluido_no_nivel: "Concluído no nível",
};

export type Tema = Base & {
  pilar_id: string;
  slug: string;
  nome: string;
  nivel: Nivel;
  status: StatusTema;
  feynman_ok: boolean;
  explicacao_feynman: string | null;
};

export type Trimestre = Base & {
  ciclo_id: string;
  ordem: number;
  periodo: string;
  data_inicio: string;
  data_fim: string;
  nucleo_titulo: string;
  tema_nucleo_id: string | null;
  paralela_titulo: string;
  tema_paralelo_id: string | null;
  idiomas_foco: string | null;
  notas_revisao: string | null;
};

export type TipoCartao = "basico" | "por_que" | "idioma";
export const TIPOS_CARTAO: Record<TipoCartao, string> = { basico: "Básico", por_que: "Por quê?", idioma: "Idioma" };

export type Cartao = Base & {
  frente: string;
  verso: string;
  tipo: TipoCartao;
  pilar_id: string | null;
  tema_id: string | null;
  tags: string[];
  fonte: string | null;
  origem: "manual" | "seed" | "importado" | "ia";
  agendamento: EstadoAgendamento | null;
  proxima_revisao: string | null;
  posicao: number;
  suspenso: boolean;
};

export type Diario = Base & {
  data: string;
  aprendizado_1: string | null;
  aprendizado_2: string | null;
  aprendizado_3: string | null;
  tags: string[];
};

export type Habito = Base & {
  data: string;
  horas_sono: number | null;
  minutos_exercicio: number | null;
  novidade: string | null;
  modo: ModoDia;
  checklist: Record<string, boolean>;
};

export type Idioma = Base & {
  nome: string;
  nivel_atual: string;
  meta: string;
  ambicao: string | null;
  motivo: string | null;
  horas_acumuladas: number;
  marcos: { titulo: string; atingido_em: string | null }[];
  status: "ativo" | "passivo" | "fila";
};

export const TABELAS_EXPORTACAO = [
  "configuracoes",
  "pilares",
  "temas",
  "ciclos",
  "trimestres",
  "recursos",
  "cartoes",
  "revisoes",
  "sessoes_estudo",
  "diarios",
  "praticas",
  "habitos",
  "idiomas",
  "passagens_sabedoria",
] as const;
