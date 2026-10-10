import Anthropic from "@anthropic-ai/sdk";

export type CodigoErro =
  | "nao_autenticado"
  | "requisicao_invalida"
  | "nao_encontrado"
  | "sem_chave"
  | "chave_invalida"
  | "sem_credito"
  | "sem_permissao"
  | "limite_diario"
  | "teto_mensal"
  | "limite_api"
  | "sobrecarga"
  | "conexao"
  | "busca_vazia"
  | "recusa"
  | "resposta_invalida"
  | "erro_api"
  | "em_andamento"
  | "fonte_nao_permitida"
  | "arquivo_invalido"
  | "erro_interno";

/** Etapas que aparecem nas mensagens de erro e no registro de chamadas. */
export type Etapa =
  | "pesquisa"
  | "verificacao"
  | "composicao"
  | "conferencia"
  | "reparo"
  | "feynman"
  | "explicar"
  | "biblioteca"
  | "busca_pdf";

export const NOME_ETAPA: Record<Etapa, string> = {
  pesquisa: "Pesquisa de fontes",
  verificacao: "Verificação de links",
  composicao: "Composição da aula",
  conferencia: "Conferência da aula",
  reparo: "Correção do formato da resposta",
  feynman: "Tutor Feynman",
  explicar: "Explicar de outro jeito",
  biblioteca: "Biblioteca",
  busca_pdf: "Busca de PDF legal",
};

/** Detalhe técnico: vai para o log e para ia_chamadas.erro_detalhe, nunca para a tela. */
export type DetalheErro = {
  etapa: Etapa | null;
  modelo: string | null;
  status: number | null;
  tipo: string | null;
  mensagem: string;
  request_id: string | null;
};

/** Erro de domínio com mensagem pronta para o usuário. */
export class ErroApp extends Error {
  constructor(
    public codigo: CodigoErro,
    public status: number,
    mensagem: string,
    public etapa: Etapa | null = null,
    public detalhe: DetalheErro | null = null,
  ) {
    super(mensagem);
  }
}

export const erros = {
  semChave: () =>
    new ErroApp("sem_chave", 503, "A IA ainda não está configurada: cadastre a variável ANTHROPIC_API_KEY na Vercel e faça um novo deploy."),
  limiteDiario: (limite: number) =>
    new ErroApp("limite_diario", 429, `Você atingiu o limite de ${limite} chamadas de IA por dia. Ajuste o limite em Você › Configurações ou tente amanhã.`),
  tetoMensal: (teto: number) =>
    new ErroApp(
      "teto_mensal",
      402,
      `O gasto com IA chegou ao teto mensal de US$ ${teto.toFixed(2)}. Para continuar este mês, aumente o teto em Você › Configurações.`,
    ),
  buscaVazia: () =>
    new ErroApp("busca_vazia", 422, "A busca não encontrou fontes legais que respondessem. Tente outro termo ou envie o arquivo para a Biblioteca."),
  recusa: () => new ErroApp("recusa", 422, "A IA recusou este pedido. Reformule o texto e tente de novo."),
  respostaInvalida: (problemas?: string) =>
    new ErroApp(
      "resposta_invalida",
      502,
      "A IA devolveu uma resposta fora do formato, mesmo depois de uma tentativa de correção. Tente de novo; o que já foi pago fica guardado.",
      null,
      problemas ? { etapa: null, modelo: null, status: null, tipo: "validacao", mensagem: problemas.slice(0, 2000), request_id: null } : null,
    ),
  emAndamento: () => new ErroApp("em_andamento", 409, "Esta aula já está sendo gerada em outra aba ou clique. Aguarde um instante."),
  naoAutenticado: () => new ErroApp("nao_autenticado", 401, "Sessão expirada. Entre de novo."),
  naoEncontrado: (o: string) => new ErroApp("nao_encontrado", 404, `${o} não encontrado.`),
  invalida: (m: string) => new ErroApp("requisicao_invalida", 400, m),
};

type Classificado = { codigo: CodigoErro; status: number; mensagem: string; etapa: Etapa | null; detalhe: DetalheErro | null };

function detalheDe(e: unknown, etapa: Etapa | null, modelo: string | null): DetalheErro {
  if (e instanceof Anthropic.APIError) {
    const corpo = e.error as { error?: { type?: string; message?: string } } | undefined;
    return {
      etapa,
      modelo,
      status: e.status ?? null,
      tipo: corpo?.error?.type ?? e.type ?? null,
      mensagem: (corpo?.error?.message ?? e.message).slice(0, 2000),
      request_id: e.requestID ?? null,
    };
  }
  return { etapa, modelo, status: null, tipo: e instanceof Error ? e.name : typeof e, mensagem: String((e as Error)?.message ?? e).slice(0, 2000), request_id: null };
}

/**
 * Traduz qualquer erro (SDK, rede, domínio) para código, status HTTP e mensagem clara
 * em português, nomeando a etapa. O texto técnico fica em `detalhe` (log e banco).
 */
export function classificarErro(e: unknown, etapa: Etapa | null = null, modelo: string | null = null): Classificado {
  if (e instanceof ErroApp) {
    const et = e.etapa ?? etapa;
    return { codigo: e.codigo, status: e.status, mensagem: e.message, etapa: et, detalhe: e.detalhe ? { ...e.detalhe, etapa: e.detalhe.etapa ?? et, modelo: e.detalhe.modelo ?? modelo } : null };
  }
  const prefixo = etapa ? `${NOME_ETAPA[etapa]}: ` : "";
  const detalhe = detalheDe(e, etapa, modelo);
  const r = (codigo: CodigoErro, status: number, mensagem: string): Classificado => ({ codigo, status, mensagem: prefixo + mensagem, etapa, detalhe });
  if (e instanceof Anthropic.AuthenticationError) return r("chave_invalida", 502, "a chave da API do Claude foi recusada. Confira ANTHROPIC_API_KEY na Vercel.");
  if (e instanceof Anthropic.PermissionDeniedError) return r("sem_permissao", 502, "a chave da API não tem permissão para este modelo ou recurso.");
  if (e instanceof Anthropic.RateLimitError) return r("limite_api", 429, "a API do Claude está limitando as chamadas agora. Espere um minuto e tente de novo.");
  if (e instanceof Anthropic.APIConnectionError) return r("conexao", 503, "não foi possível falar com a API do Claude. Verifique a conexão e tente de novo.");
  if (e instanceof Anthropic.APIError) {
    if (e.status === 402 || detalhe.tipo === "billing_error") return r("sem_credito", 402, "a conta da API do Claude está sem crédito. Adicione crédito no Console da Anthropic.");
    if (e.status === 529 || detalhe.tipo === "overloaded_error") return r("sobrecarga", 503, "a API do Claude está sobrecarregada. Tente de novo em alguns minutos.");
    if ((e.status ?? 0) >= 500) return r("erro_api", 502, `a API do Claude teve uma falha temporária (erro ${e.status}). Tente de novo.`);
    return r("erro_api", 502, `a API do Claude recusou o pedido (erro ${e.status ?? "?"}). O detalhe técnico ficou registrado em Você › Configurações.`);
  }
  return r("erro_interno", 500, "erro inesperado. Tente de novo.");
}

/** Erro já classificado, com etapa e detalhe, para subir até a rota sem perder informação. */
export function comEtapa(e: unknown, etapa: Etapa, modelo: string | null = null): ErroApp {
  if (e instanceof ErroApp && e.etapa) return e;
  const c = classificarErro(e, etapa, modelo);
  if (e instanceof ErroApp) return new ErroApp(c.codigo, c.status, `${NOME_ETAPA[etapa]}: ${c.mensagem}`, etapa, c.detalhe);
  return new ErroApp(c.codigo, c.status, c.mensagem, etapa, c.detalhe);
}

/** Domínios que a busca na web disse não conseguir acessar (erro 400). */
export function dominiosInacessiveis(e: unknown, candidatos: string[]): string[] {
  let texto: string;
  if (e instanceof Anthropic.BadRequestError) texto = detalheDe(e, null, null).mensagem;
  else if (e instanceof ErroApp && e.detalhe?.status === 400) texto = e.detalhe.mensagem;
  else return [];
  if (!/domain/i.test(texto) || !/(not accessible|inaccessible|cannot be accessed|not allowed|blocked)/i.test(texto)) return [];
  const lista = new Set(candidatos);
  const achados = (texto.toLowerCase().match(/(?:[a-z0-9-]+\.)+[a-z]{2,}/g) ?? []).map((h) => h.replace(/^www\./, ""));
  return [...new Set(achados.filter((h) => lista.has(h)))];
}
