/**
 * Orquestração das funções de IA. Recebe a porta da API e o repositório por
 * parâmetro, para ser testada sem rede e sem banco.
 *
 * Princípio: gastar o mínimo de chamadas e tokens sem baixar a qualidade da aula.
 * - Cada etapa da aula grava um checkpoint; "Tentar de novo" retoma da etapa que
 *   falhou, reaproveitando o que já foi pago.
 * - Uma geração por passo de cada vez (idempotência), mesmo com duplo clique ou duas abas.
 * - Fontes do tema ficam em cache (com data) e são reverificadas por HTTP, sem IA.
 * - Parte fixa do prompt primeiro, marcada para cache; a parte do dia vai no fim.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { verificarLinks } from "../fontes/verificar";
import { chamarJson, garantirOrcamento, registrarReaproveitamento, textoDe } from "./chamada";
import { ajustarSemIA, aplicarCorrecao, conferirAula, deduplicarCartoes, pedidoDeCorrecao } from "./conferencia";
import { comEtapa, erros, ErroApp, type Etapa } from "./erros";
import { montarPerfil } from "./perfil";
import { buscarNaWeb, DOMINIOS_DOWNLOAD, extrairResultados, filtrarEVerificar } from "./pesquisa";
import { AulaIA, CorrecaoIA, ExplicacaoIA, FeynmanIA, montarAula, type AulaSalva, type FonteVerificada, type TrechoBiblioteca } from "./schemas";
import type { Checkpoint, ContextoPasso, Deps, Geracao } from "./tipos";

export type { ContextoPasso, Deps, RegistroChamada, Repo } from "./tipos";

/** Fontes em cache valem por 30 dias; abaixo de 3 válidas, busca de novo. */
export const VALIDADE_FONTES_DIAS = 30;
export const MIN_FONTES_CACHE = 3;
/** Trava de uma geração: um pouco acima do tempo máximo da rota (300 s). */
const TRAVA_MS = 310_000;

function listarTrechos(trechos: TrechoBiblioteca[], max = 1800): string {
  if (!trechos.length) return "Nenhum trecho da biblioteca pessoal sobre este tema.";
  return trechos
    .map((t) => `[${t.id}] ${t.titulo}${t.autor ? ` (${t.autor})` : ""} — ${[t.capitulo, t.pagina ? `p. ${t.pagina}` : null].filter(Boolean).join(", ") || "sem capítulo"}\n${t.texto.slice(0, max)}`)
    .join("\n\n");
}

function listarFontes(fontes: FonteVerificada[]): string {
  if (!fontes.length) return "Nenhuma fonte externa verificada.";
  return fontes.map((f) => `[${f.id}] ${f.titulo} — ${f.acesso} (${f.tipo})`).join("\n");
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim();

/** Trechos que vêm de uma obra-base do tema (recurso cadastrado na trilha). */
export function trechosDaObraBase(trechos: TrechoBiblioteca[], recursos: { titulo: string }[]): TrechoBiblioteca[] {
  const titulos = recursos.map((r) => normalizar(r.titulo)).filter((t) => t.length >= 4);
  return trechos.filter((t) => {
    const n = normalizar(t.titulo);
    return titulos.some((r) => n.includes(r) || r.includes(n));
  });
}

function renumerar(fontes: FonteVerificada[]): FonteVerificada[] {
  return fontes.map((f, i) => ({ ...f, id: `S${i + 1}` }));
}

// ---------------------------------------------------------------------------
// Aula guiada

export type PedidoAula = { geracaoId: string; trimestreId: string; passo: "nucleo" | "paralela"; novasFontes?: boolean };

/** Encontra (ou cria) a geração deste passo. Duas abas ou dois cliques caem na mesma. */
async function abrirGeracao(deps: Deps, p: PedidoAula): Promise<Geracao> {
  const { repo } = deps;
  const propria = await repo.geracao(p.geracaoId);
  if (propria) return propria;
  const aberta = await repo.geracaoAberta(p.trimestreId, p.passo);
  if (aberta) return aberta;
  const nova = await repo.criarGeracao({ id: p.geracaoId, trimestre_id: p.trimestreId, passo: p.passo });
  if (nova) return nova;
  const corrida = await repo.geracaoAberta(p.trimestreId, p.passo);
  if (!corrida) throw new ErroApp("erro_interno", 500, "Não consegui registrar a geração da aula. Tente de novo.");
  return corrida;
}

export async function gerarAula(deps: Deps, p: PedidoAula): Promise<{ id: string; geracao_id: string; reaproveitada: boolean }> {
  const { repo } = deps;
  const agora = deps.agora?.() ?? new Date();
  const g = await abrirGeracao(deps, p);
  if (g.status === "concluida" && g.aula_id) return { id: g.aula_id, geracao_id: g.id, reaproveitada: true };
  if (!(await repo.travarGeracao(g.id, new Date(agora.getTime() + TRAVA_MS), agora))) {
    const e = erros.emAndamento();
    throw Object.assign(e, { geracaoId: g.id });
  }

  const cp: Checkpoint = { ...(g.checkpoint ?? {}) };
  let etapa: Etapa = "pesquisa";
  const salvar = (patch: Partial<Geracao>) => repo.atualizarGeracao(g.id, patch);
  try {
    const [ctx, cfg] = await Promise.all([repo.contextoPasso(p.trimestreId, p.passo), repo.config()]);
    // Orçamento das chamadas que ainda faltam, antes de gastar qualquer uma.
    await garantirOrcamento(deps, (cp.fontes ? 0 : 1) + (cp.ia ? 0 : 1));

    // 1. Biblioteca primeiro (busca de texto completo, sem IA).
    if (!cp.trechos) {
      const consulta = [ctx.trimestre.titulo, ctx.tema?.nome, ...ctx.recursos.map((r) => r.titulo)].filter(Boolean).join(" ");
      cp.trechos = (await repo.buscarTrechos(consulta, 8)).map((t, i) => ({ ...t, id: `T${i + 1}` }));
    }
    const trechos = cp.trechos;
    const obraBase = trechosDaObraBase(trechos, ctx.recursos);

    // 2. Fontes: cache do tema (reverificado por HTTP) ou busca na web.
    if (!cp.fontes) {
      const r = await obterFontes(deps, { ctx, cfg, trechos, obraBase: obraBase.length >= 3, novasFontes: Boolean(p.novasFontes), geracaoId: g.id, mudarEtapa: (e) => (etapa = e), salvar });
      cp.fontes = r.fontes;
      cp.fontes_origem = r.origem;
      cp.custos = { ...cp.custos, pesquisa: r.custo };
      await salvar({ checkpoint: cp });
    } else {
      await registrarReaproveitamento(deps, { funcao: "aula_pesquisa", etapa: "pesquisa", economia: cp.custos?.pesquisa ?? 0, geracaoId: g.id });
    }
    const fontes = cp.fontes;

    const avisos: string[] = [];
    if (!fontes.length) {
      avisos.push(
        trechos.length
          ? "A busca não encontrou fontes externas legais que respondessem; a aula usa os trechos da sua biblioteca."
          : "A busca não encontrou fontes externas legais que respondessem; a aula usa conhecimento geral, com referências a obras.",
      );
    }

    // Parte fixa (com cache): metodologia + regras + formato, e o perfil do aluno.
    const perfil = montarPerfil(cfg.nivel, await repo.dadosPerfil(ctx.tema?.id ?? null));
    const sistema: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: "text", text: deps.prompts("aula-composicao"), cache_control: { type: "ephemeral" } },
      { type: "text", text: perfil, cache_control: { type: "ephemeral" } },
    ];
    const pedidoAula = montarPedidoAula(ctx, fontes, trechos, obraBase.length > 0);

    // 3. Composição.
    let ia: AulaIA;
    if (!cp.ia) {
      etapa = "composicao";
      deps.progresso?.({ etapa: "composicao" });
      await salvar({ status: "composicao", checkpoint: cp });
      let ultimo = 0;
      const r = await chamarJson(deps, {
        etapa: "composicao",
        funcao: "aula_composicao",
        modelo: cfg.modelos.composicao,
        modeloReparo: cfg.modelos.reparo,
        esquema: AulaIA,
        system: sistema,
        mensagens: [{ role: "user", content: pedidoAula }],
        effort: "high",
        maxTokens: 32000,
        geracaoId: g.id,
        aoTexto: (n) => {
          if (n - ultimo >= 1500) {
            ultimo = n;
            deps.progresso?.({ etapa: "composicao", caracteres: n });
          }
        },
      });
      ia = r.dados;
      cp.ia = ia;
      cp.custos = { ...cp.custos, composicao: r.custo };
      await salvar({ checkpoint: cp });
    } else {
      ia = AulaIA.parse(cp.ia);
      await registrarReaproveitamento(deps, { funcao: "aula_composicao", etapa: "composicao", economia: cp.custos?.composicao ?? 0, geracaoId: g.id });
    }

    // 4. Conferência automática; no máximo uma chamada de correção com os itens que falharam.
    etapa = "conferencia";
    deps.progresso?.({ etapa: "conferencia" });
    if (!cp.conferida) {
      await salvar({ status: "conferencia" });
      ia = ajustarSemIA(ia);
      const problemas = conferirAula(ia, fontes, trechos).filter((x) => !x.semIA);
      const avisosConferencia: string[] = [];
      if (problemas.length) {
        try {
          const r = await chamarJson(deps, {
            etapa: "conferencia",
            funcao: "aula_correcao",
            modelo: cfg.modelos.composicao, // mesmo modelo e mesma parte fixa: lê o cache da composição
            modeloReparo: cfg.modelos.reparo,
            esquema: CorrecaoIA,
            system: [...sistema, { type: "text", text: deps.prompts("aula-correcao") }],
            mensagens: [{ role: "user", content: pedidoDeCorrecao(ia, problemas, fontes, trechos) }],
            effort: "medium",
            maxTokens: 8000,
            geracaoId: g.id,
          });
          ia = ajustarSemIA(aplicarCorrecao(ia, r.dados));
        } catch (e) {
          // A composição já está paga e válida: segue com as correções sem IA e avisa.
          if (e instanceof ErroApp && (e.codigo === "limite_diario" || e.codigo === "teto_mensal")) avisosConferencia.push("A conferência automática foi pulada porque o limite de IA foi atingido.");
          console.error("[ia] correção da aula falhou; seguindo sem ela", JSON.stringify(comEtapa(e, "conferencia").detalhe));
        }
        const restantes = conferirAula(ia, fontes, trechos).filter((x) => !x.semIA);
        if (restantes.length) {
          console.error("[ia] conferência: itens não corrigidos", JSON.stringify(restantes.map((x) => x.descricao)));
          avisosConferencia.push("A conferência automática encontrou pontos que não conseguiu corrigir (por exemplo, um bloco sem citação). Confira as referências desta aula.");
        }
      }
      cp.ia = ia;
      cp.conferida = true;
      cp.avisos = avisosConferencia;
      await salvar({ checkpoint: cp });
    }

    // 5. Montagem e gravação (sem IA).
    const conteudo = montarAula(ia, fontes, trechos, [...avisos, ...(cp.avisos ?? [])]);
    const dedup = deduplicarCartoes(conteudo.cartoes, await repo.frentesCartoes());
    conteudo.cartoes = dedup.cartoes;
    if (dedup.removidos) conteudo.avisos.push(`${dedup.removidos} cartão(ões) proposto(s) repetiam cartões que você já tem e foram retirados.`);
    const { id } = await repo.salvarAula({
      trimestre_id: ctx.trimestre.id,
      tema_id: ctx.tema?.id ?? null,
      passo: p.passo,
      titulo: conteudo.titulo,
      conteudo,
      usou_biblioteca: trechos.length > 0,
      modelo: cfg.modelos.composicao,
    });
    await repo.salvarFontes(id, ctx.tema?.id ?? null, conteudo.para_ir_alem.map((f) => ({ ...f, autor: f.autor })));
    await salvar({ status: "concluida", aula_id: id, em_execucao_ate: null, etapa_falha: null, erro: null, checkpoint: { fontes_origem: cp.fontes_origem } });
    return { id, geracao_id: g.id, reaproveitada: false };
  } catch (e) {
    const erro = comEtapa(e, etapa);
    await salvar({
      status: "erro",
      etapa_falha: erro.etapa ?? etapa,
      erro: { codigo: erro.codigo, mensagem: erro.message },
      em_execucao_ate: null,
      checkpoint: cp,
    }).catch(() => {});
    throw Object.assign(erro, { geracaoId: g.id });
  }
}

function montarPedidoAula(ctx: ContextoPasso, fontes: FonteVerificada[], trechos: TrechoBiblioteca[], temObraBase: boolean): string {
  return [
    `Escreva a aula guiada de hoje.`,
    `Trimestre ${ctx.trimestre.ordem} (${ctx.trimestre.periodo}) · ${ctx.passo === "nucleo" ? "núcleo" : "trilha paralela"}: ${ctx.trimestre.titulo}.`,
    ctx.tema ? `Tema: ${ctx.tema.nome} · nível ${ctx.tema.nivel}.` : "",
    ctx.pilar ? `Pilar ${ctx.pilar.numero}: ${ctx.pilar.nome}.` : "",
    ctx.aulasAnteriores.length ? `Aulas já estudadas neste passo (não repita, avance a partir delas): ${ctx.aulasAnteriores.join("; ")}.` : "Esta é a primeira aula deste passo: comece pelos fundamentos.",
    ctx.ultimas.length ? `\n## Últimas aulas (para dar continuidade)\n${ctx.ultimas.map((a) => `- ${a.titulo}: ${a.resumo}`).join("\n")}` : "",
    ctx.proximas.length ? `\n## O que vem depois na trilha (não antecipe; prepare o terreno)\n${ctx.proximas.map((a) => `- ${a.titulo}: ${a.resumo}`).join("\n")}` : "",
    "",
    "## Fontes da busca (use somente estes identificadores; nunca escreva URLs)",
    listarFontes(fontes),
    "",
    temObraBase ? "## Trechos da biblioteca pessoal — inclui a obra-base do tema: use-os como fonte principal" : "## Trechos da biblioteca pessoal (base principal quando existirem)",
    listarTrechos(trechos),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

async function obterFontes(
  deps: Deps,
  o: {
    ctx: ContextoPasso;
    cfg: Awaited<ReturnType<Deps["repo"]["config"]>>;
    trechos: TrechoBiblioteca[];
    obraBase: boolean;
    novasFontes: boolean;
    geracaoId: string;
    mudarEtapa: (e: Etapa) => void;
    salvar: (p: Partial<Geracao>) => Promise<void>;
  },
): Promise<{ fontes: FonteVerificada[]; origem: "cache" | "busca"; custo: number }> {
  const { repo } = deps;
  const { ctx, cfg } = o;
  const chave = ctx.tema?.id ?? `${ctx.trimestre.id}:${ctx.passo}`;
  const agora = deps.agora?.() ?? new Date();

  if (!o.novasFontes) {
    const cache = await repo.fontesTema(chave);
    const idadeDias = cache ? (agora.getTime() - new Date(cache.buscado_em).getTime()) / 86_400_000 : Infinity;
    if (cache && idadeDias <= VALIDADE_FONTES_DIAS) {
      o.mudarEtapa("verificacao");
      deps.progresso?.({ etapa: "verificacao", reaproveitado: true });
      await o.salvar({ status: "verificacao" });
      const v = await verificarLinks(
        cache.fontes.map((f) => f.url),
        { fetch: deps.fetch },
      );
      const validas = renumerar(cache.fontes.filter((f) => v.get(f.url)?.ok));
      if (validas.length >= MIN_FONTES_CACHE) {
        await registrarReaproveitamento(deps, { funcao: "aula_pesquisa", etapa: "pesquisa", economia: Number(cache.custo_usd), geracaoId: o.geracaoId });
        return { fontes: validas, origem: "cache", custo: 0 };
      }
    }
  }

  o.mudarEtapa("pesquisa");
  deps.progresso?.({ etapa: "pesquisa" });
  await o.salvar({ status: "pesquisa" });
  const assunto = [ctx.trimestre.titulo, ctx.tema?.nome].filter(Boolean).join(" — ");
  const maxBuscas = o.obraBase ? Math.min(cfg.maxBuscas, 2) : cfg.maxBuscas;
  const pedido = [
    `Tema de estudo: ${assunto}.`,
    ctx.pilar ? `Pilar: ${ctx.pilar.nome}. Nível: ${ctx.tema?.nivel ?? "fundamentos"}.` : "",
    ctx.recursos.length ? `Obras de referência da trilha: ${ctx.recursos.map((r) => [r.titulo, r.autor].filter(Boolean).join(", ")).join("; ")}.` : "",
    o.obraBase ? "O aluno já tem a obra-base na biblioteca pessoal: busque só fontes complementares (aulas, artigos, documentos oficiais)." : "",
    `Você tem no máximo ${maxBuscas} busca(s): faça buscas específicas.`,
    "Encontre fontes legais para estudar este tema, seguindo a ordem de prioridade.",
  ]
    .filter(Boolean)
    .join("\n");
  const { respostas, custo } = await buscarNaWeb(deps, {
    etapa: "pesquisa",
    funcao: "aula_pesquisa",
    modelo: cfg.modelos.pesquisa,
    sistema: deps.prompts("aula-pesquisa"),
    pedido,
    maxBuscas,
    geracaoId: o.geracaoId,
  });

  o.mudarEtapa("verificacao");
  deps.progresso?.({ etapa: "verificacao" });
  await o.salvar({ status: "verificacao" });
  const { fontes } = await filtrarEVerificar(extrairResultados(respostas), { maximo: 10, fetch: deps.fetch });
  if (fontes.length) await repo.salvarFontesTema(chave, fontes, custo);
  return { fontes, origem: "busca", custo };
}

// ---------------------------------------------------------------------------
// Explicar de outro jeito (só o bloco e o objetivo; resposta guardada na aula)

export async function explicarDeOutroJeito(deps: Deps, aulaId: string, indice: number) {
  const aula = await deps.repo.aula(aulaId);
  if (!aula) throw erros.naoEncontrado("Aula");
  const bloco = aula.conteudo.blocos[indice];
  if (!bloco) throw erros.invalida("Bloco inexistente.");
  if (bloco.alternativa) return { ...bloco.alternativa, reaproveitada: true };
  const cfg = await deps.repo.config();
  const { dados } = await chamarJson(deps, {
    etapa: "explicar",
    funcao: "explicar",
    modelo: cfg.modelos.explicar,
    modeloReparo: cfg.modelos.reparo,
    esquema: ExplicacaoIA,
    system: [{ type: "text", text: deps.prompts("explicar"), cache_control: { type: "ephemeral" } }],
    mensagens: [
      {
        role: "user",
        content: [
          `Objetivo da aula: ${aula.conteudo.objetivo}`,
          "",
          `## Bloco: ${bloco.titulo}`,
          bloco.paragrafos.map((p) => p.texto).join("\n\n"),
          "",
          `Analogia usada: ${bloco.analogia}`,
        ].join("\n"),
      },
    ],
    effort: "low",
    maxTokens: 4000,
  });
  const conteudo: AulaSalva = { ...aula.conteudo, blocos: aula.conteudo.blocos.map((b, i) => (i === indice ? { ...b, alternativa: dados } : b)) };
  await deps.repo.atualizarConteudoAula(aulaId, conteudo);
  return { ...dados, reaproveitada: false };
}

// ---------------------------------------------------------------------------
// Tutor Feynman (contexto enxuto: resumo e conceitos-chave das aulas do tema)

export async function avaliarFeynman(deps: Deps, temaId: string, explicacao: string) {
  const { repo } = deps;
  const texto = explicacao.trim();
  if (texto.split(/\s+/).length < 15) throw erros.invalida("Escreva pelo menos 15 palavras para o tutor avaliar.");
  if (texto.length > 8000) throw erros.invalida("A explicação passou de 8.000 caracteres. Resuma o essencial.");
  await garantirOrcamento(deps, 1).catch((e) => {
    throw comEtapa(e, "feynman");
  });
  const tema = await repo.tema(temaId);
  if (!tema) throw erros.naoEncontrado("Tema");
  const cfg = await repo.config();
  const aulas = await repo.aulasDoTema(temaId, 2);
  let referencia: string;
  if (aulas.length) {
    referencia = aulas
      .map((a) =>
        [
          `### ${a.titulo}`,
          `Resumo: ${a.objetivo}`,
          `Conceitos-chave: ${a.blocos.map((b) => b.titulo).join("; ")}`,
          ...a.cartoes.slice(0, 8).map((c) => `- ${c.frente} → ${c.verso}`),
        ].join("\n"),
      )
      .join("\n\n");
  } else {
    const trechos: TrechoBiblioteca[] = (await repo.buscarTrechos(`${tema.nome} ${texto.slice(0, 300)}`, 3)).map((t, i) => ({ ...t, id: `T${i + 1}` }));
    referencia = listarTrechos(trechos, 700);
  }
  const perfil = montarPerfil(cfg.nivel, await repo.dadosPerfil(temaId));
  const { dados: avaliacao } = await chamarJson(deps, {
    etapa: "feynman",
    funcao: "feynman",
    modelo: cfg.modelos.feynman,
    modeloReparo: cfg.modelos.reparo,
    esquema: FeynmanIA,
    system: [
      { type: "text", text: deps.prompts("feynman"), cache_control: { type: "ephemeral" } },
      { type: "text", text: perfil },
    ],
    mensagens: [
      {
        role: "user",
        content: [
          `Tema: ${tema.nome}${tema.pilar ? ` (pilar: ${tema.pilar})` : ""} · nível ${tema.nivel}.`,
          "",
          aulas.length ? "## O que o aluno estudou (resumo das aulas)" : "## Trechos da biblioteca pessoal",
          referencia,
          "",
          "## Explicação do aluno (escrita sem consultar)",
          texto,
        ].join("\n"),
      },
    ],
    effort: "medium",
    maxTokens: 16000,
  });
  const salvo = await repo.salvarFeynman({ tema_id: temaId, explicacao: texto, avaliacao });
  return { ...salvo, avaliacao };
}

// ---------------------------------------------------------------------------
// Busca de PDF legal (somente domínio público, acesso aberto e fontes oficiais)

export async function buscarPdfLegal(deps: Deps, consulta: string) {
  const q = consulta.trim();
  if (q.length < 3) throw erros.invalida("Digite o título ou o autor da obra.");
  const cfg = await deps.repo.config();
  const { respostas } = await buscarNaWeb(deps, {
    etapa: "busca_pdf",
    funcao: "busca_pdf",
    modelo: cfg.modelos.pesquisa,
    sistema: deps.prompts("busca-pdf"),
    pedido: `Obra procurada: ${q.slice(0, 300)}`,
    dominios: DOMINIOS_DOWNLOAD,
    maxBuscas: cfg.maxBuscas,
  });
  const { fontes } = await filtrarEVerificar(extrairResultados(respostas), { somenteDownload: true, maximo: 8, fetch: deps.fetch });
  const observacao = respostas.length ? textoDe(respostas[respostas.length - 1]).trim() : "";
  if (!fontes.length) throw erros.buscaVazia();
  return { fontes, observacao };
}
