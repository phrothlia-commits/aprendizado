import type Anthropic from "@anthropic-ai/sdk";
import type { DetalheErro, Etapa } from "./erros";
import type { EtapaModelo, IdModelo } from "./modelos";
import type { AulaSalva, FeynmanIA, FonteVerificada, TrechoBiblioteca } from "./schemas";

export type Mensagem = Anthropic.Beta.BetaMessage;
export type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;

/** Porta para a API: em produção usa o SDK com streaming; nos testes, um dublê. */
export type PortaIA = {
  chamar(params: Params, opcoes?: { aoTexto?: (caracteres: number) => void }): Promise<Mensagem>;
};

export type NomePrompt = "aula-pesquisa" | "aula-composicao" | "aula-correcao" | "feynman" | "busca-pdf" | "explicar" | "reparo-json";

export type ConfigIA = {
  limiteDiario: number;
  tetoMensal: number;
  maxBuscas: number;
  nivel: "iniciante" | "intermediario" | "avancado";
  modelos: Record<EtapaModelo, IdModelo>;
};

export type ContextoPasso = {
  trimestre: { id: string; ordem: number; periodo: string; titulo: string; tema_id: string | null };
  passo: "nucleo" | "paralela";
  tema: { id: string; nome: string; nivel: string } | null;
  pilar: { numero: number; nome: string } | null;
  recursos: { titulo: string; autor: string | null }[];
  aulasAnteriores: string[];
  /** As duas últimas aulas deste passo, com o objetivo como resumo de uma linha. */
  ultimas: { titulo: string; resumo: string }[];
  /** O que vem depois na trilha (próximos trimestres deste passo). */
  proximas: { titulo: string; resumo: string }[];
};

/** Dados para o perfil do aluno (montado sem IA). */
export type DadosPerfil = {
  aulasConcluidas: string[];
  cartoesMaisErrados: string[];
  lacunasFeynman: string[];
  preTesteErrado: { pergunta: string; resposta: string }[];
};

export type RegistroChamada = {
  funcao: string;
  etapa: Etapa;
  modelo: string;
  input_tokens: number;
  output_tokens: number;
  cache_leitura_tokens: number;
  cache_escrita_tokens: number;
  buscas_web: number;
  custo_usd: number;
  economia_usd: number;
  duracao_ms: number;
  sucesso: boolean;
  erro: string | null;
  erro_detalhe: DetalheErro | null;
  reaproveitado: boolean;
  geracao_id: string | null;
};

export type StatusGeracao = "pendente" | "pesquisa" | "verificacao" | "composicao" | "conferencia" | "concluida" | "erro";

export type Checkpoint = {
  trechos?: TrechoBiblioteca[];
  fontes?: FonteVerificada[];
  fontes_origem?: "cache" | "busca";
  avisos?: string[];
  ia?: unknown; // AulaIA validada
  conferida?: boolean;
  /** Quanto cada etapa custou: vira "economia" quando o checkpoint é reaproveitado. */
  custos?: { pesquisa?: number; composicao?: number };
};

export type Geracao = {
  id: string;
  trimestre_id: string;
  passo: "nucleo" | "paralela";
  status: StatusGeracao;
  etapa_falha: string | null;
  checkpoint: Checkpoint;
  erro: { codigo: string; mensagem: string } | null;
  aula_id: string | null;
  em_execucao_ate: string | null;
};

export type AulaGuardada = { id: string; tema_id: string | null; conteudo: AulaSalva };

export interface Repo {
  config(): Promise<ConfigIA>;
  consumo(): Promise<{ chamadasHoje: number; custoMes: number }>;
  registrarChamada(r: RegistroChamada): Promise<void>;

  buscarTrechos(consulta: string, limite: number): Promise<Omit<TrechoBiblioteca, "id">[]>;
  contextoPasso(trimestreId: string, passo: "nucleo" | "paralela"): Promise<ContextoPasso>;
  dadosPerfil(temaId: string | null): Promise<DadosPerfil>;
  frentesCartoes(): Promise<string[]>;

  geracao(id: string): Promise<Geracao | null>;
  geracaoAberta(trimestreId: string, passo: "nucleo" | "paralela"): Promise<Geracao | null>;
  /** Cria a geração; devolve null se já existir uma aberta para o mesmo passo (corrida entre abas). */
  criarGeracao(g: { id: string; trimestre_id: string; passo: "nucleo" | "paralela" }): Promise<Geracao | null>;
  /** Trava atômica: só uma execução por geração até `ate`. */
  travarGeracao(id: string, ate: Date, agora: Date): Promise<boolean>;
  atualizarGeracao(id: string, patch: Partial<Omit<Geracao, "id" | "trimestre_id" | "passo">>): Promise<void>;

  fontesTema(chave: string): Promise<{ fontes: FonteVerificada[]; custo_usd: number; buscado_em: string } | null>;
  salvarFontesTema(chave: string, fontes: FonteVerificada[], custo: number): Promise<void>;
  dominiosBloqueados(): Promise<string[]>;
  registrarDominiosBloqueados(dominios: string[]): Promise<void>;

  salvarAula(a: { trimestre_id: string; tema_id: string | null; passo: string; titulo: string; conteudo: AulaSalva; usou_biblioteca: boolean; modelo: string }): Promise<{ id: string }>;
  salvarFontes(aulaId: string | null, temaId: string | null, fontes: (FonteVerificada & { autor?: string | null })[]): Promise<void>;
  aula(id: string): Promise<AulaGuardada | null>;
  atualizarConteudoAula(id: string, conteudo: AulaSalva): Promise<void>;
  aulasDoTema(temaId: string, limite: number): Promise<AulaSalva[]>;

  tema(temaId: string): Promise<{ id: string; nome: string; nivel: string; pilar: string | null } | null>;
  salvarFeynman(f: { tema_id: string; explicacao: string; avaliacao: FeynmanIA }): Promise<{ id: string; created_at: string }>;
}

export type EventoProgresso = { etapa: "pesquisa" | "verificacao" | "composicao" | "conferencia"; reaproveitado?: boolean; caracteres?: number };

export type Deps = {
  ia: PortaIA;
  repo: Repo;
  prompts: (nome: NomePrompt) => string;
  fetch?: typeof fetch;
  agora?: () => Date;
  progresso?: (e: EventoProgresso) => void;
};
