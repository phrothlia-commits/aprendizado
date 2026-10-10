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
  | "limite_api"
  | "sobrecarga"
  | "conexao"
  | "busca_vazia"
  | "recusa"
  | "resposta_invalida"
  | "fonte_nao_permitida"
  | "arquivo_invalido"
  | "erro_interno";

/** Erro de domínio com mensagem pronta para o usuário. */
export class ErroApp extends Error {
  constructor(
    public codigo: CodigoErro,
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export const erros = {
  semChave: () =>
    new ErroApp("sem_chave", 503, "A IA ainda não está configurada: cadastre a variável ANTHROPIC_API_KEY na Vercel e faça um novo deploy."),
  limiteDiario: (limite: number) =>
    new ErroApp("limite_diario", 429, `Você atingiu o limite de ${limite} chamadas de IA por dia. Ajuste o limite em Você › Configurações ou tente amanhã.`),
  buscaVazia: () =>
    new ErroApp("busca_vazia", 422, "A busca não encontrou fontes legais que respondessem. Tente outro termo ou envie o arquivo para a Biblioteca."),
  recusa: () => new ErroApp("recusa", 422, "A IA recusou este pedido. Reformule o texto e tente de novo."),
  respostaInvalida: () =>
    new ErroApp("resposta_invalida", 502, "A IA devolveu uma resposta incompleta. Tente de novo; a chamada já foi registrada."),
  naoAutenticado: () => new ErroApp("nao_autenticado", 401, "Sessão expirada. Entre de novo."),
  naoEncontrado: (o: string) => new ErroApp("nao_encontrado", 404, `${o} não encontrado.`),
  invalida: (m: string) => new ErroApp("requisicao_invalida", 400, m),
};

/** Traduz qualquer erro (SDK, rede, domínio) para código, status HTTP e mensagem clara. */
export function classificarErro(e: unknown): { codigo: CodigoErro; status: number; mensagem: string } {
  if (e instanceof ErroApp) return { codigo: e.codigo, status: e.status, mensagem: e.message };
  if (e instanceof Anthropic.AuthenticationError) {
    return { codigo: "chave_invalida", status: 502, mensagem: "A chave da API do Claude foi recusada. Confira ANTHROPIC_API_KEY na Vercel." };
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return { codigo: "sem_permissao", status: 502, mensagem: "A chave da API não tem permissão para este modelo ou recurso." };
  }
  if (e instanceof Anthropic.RateLimitError) {
    return { codigo: "limite_api", status: 429, mensagem: "A API do Claude está limitando as chamadas agora. Espere um minuto e tente de novo." };
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return { codigo: "conexao", status: 503, mensagem: "Não foi possível falar com a API do Claude. Verifique a conexão e tente de novo." };
  }
  if (e instanceof Anthropic.APIError) {
    if (e.status === 402 || e.type === "billing_error") {
      return { codigo: "sem_credito", status: 402, mensagem: "A conta da API do Claude está sem crédito. Adicione crédito no Console da Anthropic." };
    }
    if (e.status === 529 || e.type === "overloaded_error") {
      return { codigo: "sobrecarga", status: 503, mensagem: "A API do Claude está sobrecarregada. Tente de novo em alguns minutos." };
    }
    return { codigo: "erro_interno", status: 502, mensagem: `Erro da API do Claude (${e.status ?? "?"}): ${e.message}`.slice(0, 400) };
  }
  return { codigo: "erro_interno", status: 500, mensagem: "Erro inesperado. Tente de novo." };
}
