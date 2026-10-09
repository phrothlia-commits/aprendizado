/**
 * Orquestração das funções de IA. Recebe a porta da API e o repositório por
 * parâmetro, para ser testada sem rede e sem banco.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { calcularCusto, resumirUso } from "./custos";
import { classificarErro, erros } from "./erros";
import { buscarNaWeb, DOMINIOS_DOWNLOAD, extrairResultados, filtrarEVerificar, type ChamadaRegistrada, type PortaIA } from "./pesquisa";
import { AulaIA, FeynmanIA, montarAula, type AulaSalva, type FonteVerificada, type TrechoBiblioteca } from "./schemas";

type Mensagem = Anthropic.Beta.BetaMessage;
type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;

export type ContextoPasso = {
  trimestre: { id: string; ordem: number; periodo: string; titulo: string; tema_id: string | null };
  passo: "nucleo" | "paralela";
  tema: { id: string; nome: string; nivel: string } | null;
  pilar: { numero: number; nome: string } | null;
  recursos: { titulo: string; autor: string | null }[];
  aulasAnteriores: string[];
};

export type RegistroChamada = {
  funcao: string;
  modelo: string;
  input_tokens: number;
  output_tokens: number;
  cache_leitura_tokens: number;
  cache_escrita_tokens: number;
  buscas_web: number;
  custo_usd: number;
  sucesso: boolean;
  erro: string | null;
};

export interface Repo {
  limiteDiario(): Promise<number>;
  chamadasHoje(): Promise<number>;
  registrarChamada(r: RegistroChamada): Promise<void>;
  buscarTrechos(consulta: string, limite: number): Promise<Omit<TrechoBiblioteca, "id">[]>;
  contextoPasso(trimestreId: string, passo: "nucleo" | "paralela"): Promise<ContextoPasso>;
  salvarAula(a: { trimestre_id: string; tema_id: string | null; passo: string; titulo: string; conteudo: AulaSalva; usou_biblioteca: boolean; modelo: string }): Promise<{ id: string }>;
  salvarFontes(aulaId: string | null, temaId: string | null, fontes: (FonteVerificada & { autor?: string | null })[]): Promise<void>;
  tema(temaId: string): Promise<{ id: string; nome: string; nivel: string; pilar: string | null } | null>;
  salvarFeynman(f: { tema_id: string; explicacao: string; avaliacao: FeynmanIA }): Promise<{ id: string; created_at: string }>;
}

export type Deps = { ia: PortaIA; repo: Repo; prompts: (nome: "aula-pesquisa" | "aula-composicao" | "feynman" | "busca-pdf") => string; modelo: string; betas: string[]; fetch?: typeof fetch };

function registrador(repo: Repo, modelo: string) {
  return async (c: ChamadaRegistrada) => {
    const m = c.mensagem;
    const uso = resumirUso(m?.usage);
    await repo.registrarChamada({
      funcao: c.funcao,
      modelo: m?.model ?? modelo,
      ...uso,
      custo_usd: calcularCusto(m?.model ?? modelo, m?.usage),
      sucesso: !c.erro && m?.stop_reason !== "refusal",
      erro: c.erro ? classificarErro(c.erro).codigo : m?.stop_reason === "refusal" ? "recusa" : null,
    });
  };
}

async function garantirLimite(repo: Repo, chamadasNecessarias: number) {
  const [limite, feitas] = await Promise.all([repo.limiteDiario(), repo.chamadasHoje()]);
  if (feitas + chamadasNecessarias > limite) throw erros.limiteDiario(limite);
}

/** Chamada com saída JSON validada por schema. */
async function chamarJson<T>(
  deps: Deps,
  funcao: string,
  esquema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
  formato: unknown,
  params: Omit<Params, "model" | "max_tokens" | "betas">,
  registrar: (c: ChamadaRegistrada) => Promise<void>,
): Promise<T> {
  let resposta: Mensagem;
  try {
    resposta = await deps.ia.chamar({
      ...params,
      model: deps.modelo,
      max_tokens: 32000,
      betas: deps.betas,
      fallbacks: "default",
      output_config: { ...(params.output_config ?? {}), format: formato },
    } as Params);
  } catch (erro) {
    await registrar({ funcao, mensagem: null, erro });
    throw erro;
  }
  await registrar({ funcao, mensagem: resposta });
  if (resposta.stop_reason === "refusal") throw erros.recusa();
  const texto = resposta.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw erros.respostaInvalida();
  }
  const r = esquema.safeParse(json);
  if (!r.success) throw erros.respostaInvalida();
  return r.data;
}

function listarTrechos(trechos: TrechoBiblioteca[]): string {
  if (!trechos.length) return "Nenhum trecho da biblioteca pessoal sobre este tema.";
  return trechos
    .map((t) => `[${t.id}] ${t.titulo}${t.autor ? ` (${t.autor})` : ""} — ${[t.capitulo, t.pagina ? `p. ${t.pagina}` : null].filter(Boolean).join(", ") || "sem capítulo"}\n${t.texto.slice(0, 1800)}`)
    .join("\n\n");
}

function listarFontes(fontes: FonteVerificada[]): string {
  if (!fontes.length) return "Nenhuma fonte externa verificada.";
  return fontes.map((f) => `[${f.id}] ${f.titulo} — ${f.acesso} (${f.tipo})`).join("\n");
}

// ---------------------------------------------------------------------------
// Aula guiada

export async function gerarAula(deps: Deps, trimestreId: string, passo: "nucleo" | "paralela") {
  const { repo } = deps;
  await garantirLimite(repo, 2);
  const ctx = await repo.contextoPasso(trimestreId, passo);
  const registrar = registrador(repo, deps.modelo);

  const assunto = [ctx.trimestre.titulo, ctx.tema?.nome].filter(Boolean).join(" — ");
  const consultaBiblioteca = [ctx.trimestre.titulo, ctx.tema?.nome, ...ctx.recursos.map((r) => r.titulo)].filter(Boolean).join(" ");
  const trechos: TrechoBiblioteca[] = (await repo.buscarTrechos(consultaBiblioteca, 8)).map((t, i) => ({ ...t, id: `T${i + 1}` }));

  const pedidoBusca = [
    `Tema de estudo: ${assunto}.`,
    ctx.pilar ? `Pilar: ${ctx.pilar.nome}. Nível: ${ctx.tema?.nivel ?? "fundamentos"}.` : "",
    ctx.recursos.length ? `Obras de referência da trilha: ${ctx.recursos.map((r) => [r.titulo, r.autor].filter(Boolean).join(", ")).join("; ")}.` : "",
    "Encontre fontes legais para estudar este tema, seguindo a ordem de prioridade.",
  ]
    .filter(Boolean)
    .join("\n");
  const respostasBusca = await buscarNaWeb(
    deps.ia,
    { sistema: deps.prompts("aula-pesquisa"), pedido: pedidoBusca, modelo: deps.modelo, betas: deps.betas },
    registrar,
    "aula_pesquisa",
  );
  const { fontes } = await filtrarEVerificar(extrairResultados(respostasBusca), { maximo: 10, fetch: deps.fetch });

  const avisos: string[] = [];
  if (!fontes.length) {
    avisos.push(
      trechos.length
        ? "A busca não encontrou fontes externas legais que respondessem; a aula usa os trechos da sua biblioteca."
        : "A busca não encontrou fontes externas legais que respondessem; a aula usa conhecimento geral, com referências a obras.",
    );
  }

  const pedidoAula = [
    `Escreva a aula guiada de hoje.`,
    `Trimestre ${ctx.trimestre.ordem} (${ctx.trimestre.periodo}) · ${passo === "nucleo" ? "núcleo" : "trilha paralela"}: ${ctx.trimestre.titulo}.`,
    ctx.tema ? `Tema: ${ctx.tema.nome} · nível ${ctx.tema.nivel}.` : "",
    ctx.pilar ? `Pilar ${ctx.pilar.numero}: ${ctx.pilar.nome}.` : "",
    ctx.aulasAnteriores.length ? `Aulas já estudadas neste passo (não repita, avance a partir delas): ${ctx.aulasAnteriores.join("; ")}.` : "Esta é a primeira aula deste passo: comece pelos fundamentos.",
    "",
    "## Fontes da busca (use somente estes identificadores; nunca escreva URLs)",
    listarFontes(fontes),
    "",
    "## Trechos da biblioteca pessoal (base principal quando existirem)",
    listarTrechos(trechos),
  ]
    .filter((l) => l !== null)
    .join("\n");

  const { betaZodOutputFormat } = await import("@anthropic-ai/sdk/helpers/beta/zod");
  const ia = await chamarJson(
    deps,
    "aula_composicao",
    AulaIA,
    betaZodOutputFormat(AulaIA),
    {
      system: [{ type: "text", text: deps.prompts("aula-composicao"), cache_control: { type: "ephemeral" } }],
      output_config: { effort: "high" },
      messages: [{ role: "user", content: pedidoAula }],
    },
    registrar,
  );

  const conteudo = montarAula(ia, fontes, trechos, avisos);
  const { id } = await repo.salvarAula({
    trimestre_id: ctx.trimestre.id,
    tema_id: ctx.tema?.id ?? null,
    passo,
    titulo: conteudo.titulo,
    conteudo,
    usou_biblioteca: trechos.length > 0,
    modelo: deps.modelo,
  });
  await repo.salvarFontes(
    id,
    ctx.tema?.id ?? null,
    conteudo.para_ir_alem.map((f) => ({ ...f, autor: f.autor })),
  );
  return { id, conteudo };
}

// ---------------------------------------------------------------------------
// Tutor Feynman

export async function avaliarFeynman(deps: Deps, temaId: string, explicacao: string) {
  const { repo } = deps;
  const texto = explicacao.trim();
  if (texto.split(/\s+/).length < 15) throw erros.invalida("Escreva pelo menos 15 palavras para o tutor avaliar.");
  if (texto.length > 8000) throw erros.invalida("A explicação passou de 8.000 caracteres. Resuma o essencial.");
  await garantirLimite(repo, 1);
  const tema = await repo.tema(temaId);
  if (!tema) throw erros.naoEncontrado("Tema");
  const trechos: TrechoBiblioteca[] = (await repo.buscarTrechos(`${tema.nome} ${texto.slice(0, 300)}`, 5)).map((t, i) => ({ ...t, id: `T${i + 1}` }));
  const registrar = registrador(repo, deps.modelo);
  const { betaZodOutputFormat } = await import("@anthropic-ai/sdk/helpers/beta/zod");
  const avaliacao = await chamarJson(
    deps,
    "feynman",
    FeynmanIA,
    betaZodOutputFormat(FeynmanIA),
    {
      system: [{ type: "text", text: deps.prompts("feynman"), cache_control: { type: "ephemeral" } }],
      output_config: { effort: "medium" },
      messages: [
        {
          role: "user",
          content: [
            `Tema: ${tema.nome}${tema.pilar ? ` (pilar: ${tema.pilar})` : ""} · nível ${tema.nivel}.`,
            "",
            "## Trechos da biblioteca pessoal",
            listarTrechos(trechos),
            "",
            "## Explicação do aluno (escrita sem consultar)",
            texto,
          ].join("\n"),
        },
      ],
    },
    registrar,
  );
  const salvo = await repo.salvarFeynman({ tema_id: temaId, explicacao: texto, avaliacao });
  return { ...salvo, avaliacao };
}

// ---------------------------------------------------------------------------
// Busca de PDF legal (somente domínio público, acesso aberto e fontes oficiais)

export async function buscarPdfLegal(deps: Deps, consulta: string) {
  const q = consulta.trim();
  if (q.length < 3) throw erros.invalida("Digite o título ou o autor da obra.");
  await garantirLimite(deps.repo, 1);
  const respostas = await buscarNaWeb(
    deps.ia,
    {
      sistema: deps.prompts("busca-pdf"),
      pedido: `Obra procurada: ${q.slice(0, 300)}`,
      dominios: DOMINIOS_DOWNLOAD,
      maxBuscas: 4,
      modelo: deps.modelo,
      betas: deps.betas,
    },
    registrador(deps.repo, deps.modelo),
    "busca_pdf",
  );
  const { fontes } = await filtrarEVerificar(extrairResultados(respostas), { somenteDownload: true, maximo: 8, fetch: deps.fetch });
  const observacao = respostas
    .at(-1)
    ?.content.map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!fontes.length) throw erros.buscaVazia();
  return { fontes, observacao: observacao ?? "" };
}
