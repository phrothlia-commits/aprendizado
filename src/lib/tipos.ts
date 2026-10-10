import type { Algoritmo, EstadoAgendamento } from "./agendamento";
import type { ModoDia } from "./hoje";

type Base = { id: string; created_at: string; updated_at: string };

export type ModeloIA = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";
export type Configuracoes = {
  novos_por_dia: number;
  revisoes_por_dia: number;
  algoritmo: Algoritmo;
  ia_limite_diario?: number;
  // Colunas da migração 0003 (ausentes antes dela)
  ia_modelo_pesquisa?: ModeloIA;
  ia_modelo_composicao?: ModeloIA;
  ia_modelo_feynman?: ModeloIA;
  ia_modelo_explicar?: ModeloIA;
  ia_modelo_reparo?: ModeloIA;
  ia_max_buscas?: number;
  ia_teto_mensal_usd?: number | string;
  ia_nivel?: "iniciante" | "intermediario" | "avancado";
};

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
  tipo_exercicio: string | null;
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

export type AulaResumo = { id: string; passo: "nucleo" | "paralela"; titulo: string; trimestre_id: string | null; estudada_em: string | null; created_at: string };

export type RefNumerada = { n: number; citacao: string; url: string | null; titulo: string | null; acesso: string | null; origem: "busca" | "biblioteca" | "obra"; arquivo_id: string | null };
export type FonteAula = { id: string; url: string; titulo: string; tipo: string; categoria: string; acesso: string; gratuita: boolean; permiteDownload: boolean; autor: string | null; por_que: string };
export type CartaoProposto = { frente: string; verso: string; tipo: "basico" | "por_que"; tags: string[]; fonte: string };
export type ConteudoAula = {
  titulo: string;
  objetivo: string;
  pre_teste: { pergunta: string; resposta: string }[];
  blocos: {
    titulo: string;
    paragrafos: { texto: string; refs: number[] }[];
    analogia: string;
    perguntas: { pergunta: string; resposta: string }[];
    alternativa?: { explicacao: string; analogia: string };
  }[];
  referencias: RefNumerada[];
  para_ir_alem: FonteAula[];
  cartoes: CartaoProposto[];
  avisos: string[];
};
export type Aula = AulaResumo & {
  tema_id: string | null;
  conteudo: ConteudoAula;
  respostas: { pre?: string[]; pre_ok?: (boolean | null)[]; rec?: Record<string, string>; passo?: number };
  cartoes_resolvidos: { i: number; status: "aprovado" | "descartado" }[];
  usou_biblioteca: boolean;
};

export type Fonte = {
  id: string;
  aula_id: string | null;
  tema_id: string | null;
  tipo: string;
  categoria: string;
  titulo: string;
  autor: string | null;
  url: string;
  gratuita: boolean;
  acesso: string | null;
  permite_download: boolean;
  consumido: boolean;
  created_at: string;
};

export type AvaliacaoFeynman = {
  correto: string[];
  lacunas: string[];
  erros: { trecho: string; correcao: string; referencia: string }[];
  perguntas: string[];
  cartoes: CartaoProposto[];
  atingiu_criterio: boolean;
  referencias: string[];
};
export type RegistroFeynman = { id: string; tema_id: string; explicacao: string; avaliacao: AvaliacaoFeynman; created_at: string };

export type ArquivoBiblioteca = {
  id: string;
  recurso_id: string | null;
  titulo: string;
  autor: string | null;
  formato: "pdf" | "epub" | "txt" | "kindle" | "html";
  caminho: string;
  tamanho_bytes: number | null;
  origem: "upload" | "fonte_aberta";
  fonte_url: string | null;
  status: "processando" | "pronto" | "erro";
  erro: string | null;
  total_trechos: number;
  created_at: string;
};

export type Recurso = {
  id: string;
  titulo: string;
  autor: string | null;
  tipo: "livro" | "curso" | "video" | "podcast" | "lei";
  url: string | null;
  pilar_id: string | null;
  tema_id: string | null;
  status: "quero_ler" | "lendo" | "concluido";
  anotacoes: string | null;
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
  "aulas",
  "fontes",
  "feynman",
  "ia_chamadas",
  "biblioteca_arquivos",
  "biblioteca_trechos",
] as const;
