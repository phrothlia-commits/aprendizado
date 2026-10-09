/** Dublês de teste: mensagens da API, repositório em memória e respostas da IA. */
import type Anthropic from "@anthropic-ai/sdk";
import type { AulaIA, FeynmanIA } from "../ia/schemas";
import type { ContextoPasso, RegistroChamada, Repo } from "../ia/servicos";

type Bloco = Record<string, unknown>;

export function mensagem(content: Bloco[], extra: Partial<Anthropic.Beta.BetaMessage> = {}): Anthropic.Beta.BetaMessage {
  return {
    id: "msg_teste",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: content as unknown as Anthropic.Beta.BetaContentBlock[],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 } },
    ...extra,
  } as Anthropic.Beta.BetaMessage;
}

export function aulaIAExemplo(): AulaIA {
  return {
    titulo: "Prática de recuperação",
    objetivo: "Explicar por que tentar lembrar fixa mais do que reler.",
    pre_teste: [
      { pergunta: "Reler 4 vezes ou testar-se 3 vezes?", resposta: "Testar-se." },
      { pergunta: "O que é ilusão de fluência?", resposta: "Confundir familiaridade com saber." },
    ],
    blocos: [
      {
        titulo: "A ilusão de saber",
        texto: "Reler dá sensação de familiaridade [1].\n\nO teste produz aprendizado [2].",
        analogia_ou_exemplo: "Uma trilha na mata vira estrada com o uso.",
        referencias: [
          { fonte_id: null, trecho_id: "T1", citacao: "Brown et al., Fixe o Conhecimento, cap. 2" },
          { fonte_id: "S2", trecho_id: null, citacao: "TED" },
        ],
        perguntas_recuperacao: [{ pergunta: "Por que reler engana?", resposta: "Porque reconhecer não é lembrar." }],
      },
      {
        titulo: "Como aplicar",
        texto: "Feche o livro e escreva o que lembra [1].",
        analogia_ou_exemplo: "Como um treino de academia.",
        referencias: [
          { fonte_id: "S2", trecho_id: null, citacao: "TED" },
          { fonte_id: null, trecho_id: null, citacao: "Roediger e Karpicke, Psychological Science, 2006" },
        ],
        perguntas_recuperacao: [{ pergunta: "O que fazer ao fechar o livro?", resposta: "Escrever o que lembra." }],
      },
    ],
    para_ir_alem: [{ fonte_id: "S2", tipo: "video", autor: "TED", por_que: "Palestra introdutória." }],
    cartoes: [
      { frente: "O que é ilusão de fluência?", verso: "Confundir familiaridade com saber.", tipo: "basico", tags: ["Pratica de recuperacao", "memoria", "memoria"], fonte: "T1 — cap. 2, p. 40" },
      { frente: "Por que testar-se fixa mais?", verso: "Lembrar reconstrói a informação.", tipo: "por_que", tags: ["memoria"], fonte: "Roediger e Karpicke, 2006" },
    ],
  };
}

export function feynmanIAExemplo(): FeynmanIA {
  return {
    correto: ["Revisar ajuda a lembrar."],
    lacunas: ["O intervalo entre revisões cresce."],
    erros: [{ trecho: "até decorar", correcao: "Cada revisão é um teste de memória.", referencia: "Cepeda et al., 2006" }],
    perguntas: ["Por que espaçar?", "Como escolher o intervalo?", "O que acontece se revisar cedo demais?"],
    cartoes: [{ frente: "O que cresce na repetição espaçada?", verso: "O intervalo entre revisões.", tipo: "basico", tags: ["memoria"], fonte: "Cepeda et al., 2006" }],
    atingiu_criterio: false,
    referencias: ["Cepeda et al., Psychological Bulletin, 2006"],
  };
}

export const CONTEXTO: ContextoPasso = {
  trimestre: { id: "00000000-0000-4000-8000-000000000001", ordem: 1, periodo: "out–dez/2026", titulo: "Aprender a aprender e clareza", tema_id: "t1" },
  passo: "nucleo",
  tema: { id: "00000000-0000-4000-8000-0000000000aa", nome: "Memória e técnicas de estudo", nivel: "fundamentos" },
  pilar: { numero: 1, nome: "Aprender a aprender" },
  recursos: [{ titulo: "Fixe o Conhecimento", autor: "Brown" }],
  aulasAnteriores: [],
};

export function repoMemoria(opcoes: { limite?: number; feitas?: number; trechos?: number } = {}) {
  const chamadas: RegistroChamada[] = [];
  const aulas: unknown[] = [];
  const fontes: unknown[] = [];
  const feynman: unknown[] = [];
  const repo: Repo = {
    limiteDiario: async () => opcoes.limite ?? 20,
    chamadasHoje: async () => opcoes.feitas ?? 0,
    registrarChamada: async (r) => {
      chamadas.push(r);
    },
    buscarTrechos: async () =>
      Array.from({ length: opcoes.trechos ?? 1 }, () => ({ arquivo_id: "a1", titulo: "Fixe o Conhecimento", autor: "Brown", capitulo: "Capítulo 2", pagina: 40, texto: "Testar-se fixa." })),
    contextoPasso: async () => CONTEXTO,
    salvarAula: async (a) => {
      aulas.push(a);
      return { id: "aula-1" };
    },
    salvarFontes: async (_a, _t, f) => {
      fontes.push(...f);
    },
    tema: async (id) => (id === CONTEXTO.tema!.id ? { id, nome: "Repetição espaçada", nivel: "fundamentos", pilar: "Aprender a aprender" } : null),
    salvarFeynman: async (f) => {
      feynman.push(f);
      return { id: "f-1", created_at: "2026-10-09T12:00:00Z" };
    },
  };
  return { repo, chamadas, aulas, fontes, feynman };
}

/** Porta da IA roteirizada: devolve as mensagens na ordem e guarda os pedidos. */
export function iaRoteirizada(respostas: (Anthropic.Beta.BetaMessage | Error)[]) {
  const pedidos: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  return {
    pedidos,
    porta: {
      chamar: async (p: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
        pedidos.push(p);
        const r = respostas.shift();
        if (!r) throw new Error("sem resposta roteirizada");
        if (r instanceof Error) throw r;
        return r;
      },
    },
  };
}

export const respostaBusca = (urls: [string, string][]) =>
  mensagem([
    { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "x" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "s1",
      content: urls.map(([url, title]) => ({ type: "web_search_result", url, title, encrypted_content: "", page_age: null })),
    },
    { type: "text", text: "Fontes encontradas." },
  ]);

export const respostaJson = (dados: unknown) => mensagem([{ type: "text", text: JSON.stringify(dados) }]);
