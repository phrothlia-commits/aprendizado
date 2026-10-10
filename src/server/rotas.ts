/**
 * Handlers das rotas de API, separados dos arquivos route.ts para serem
 * testados com dependências falsas (sem rede, sem banco, sem chave).
 * Todas as rotas exigem login (token do Supabase no header).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { baixarObraAberta } from "./biblioteca/importar";
import { classificarErro, comEtapa, ErroApp, erros } from "./ia/erros";
import { avaliarFeynman, buscarPdfLegal, explicarDeOutroJeito, gerarAula } from "./ia/servicos";
import type { Deps, NomePrompt, PortaIA, Repo } from "./ia/tipos";

export type Contexto = { sb: SupabaseClient; userId: string };

export type Fabricas = {
  autenticar(req: Request): Promise<Contexto>;
  repo(ctx: Contexto): Repo;
  /** Lança `erros.semChave()` quando ANTHROPIC_API_KEY não existe. */
  ia(): PortaIA;
  iaConfigurada(): boolean;
  prompts: (nome: NomePrompt) => string;
  processar(sb: SupabaseClient, arquivoId: string, bytes?: Uint8Array): Promise<{ ids: string[] }>;
  fetch?: typeof fetch;
  agora?: () => Date;
};

export function json(dados: unknown, status = 200) {
  return Response.json(dados, { status, headers: { "cache-control": "no-store" } });
}

/** Mensagem amigável para a tela; detalhe técnico só no log do servidor. */
export function respostaDeErro(e: unknown) {
  const { codigo, status, mensagem, etapa, detalhe } = classificarErro(e);
  if (status >= 500 || detalhe) console.error("[rota] erro", JSON.stringify({ codigo, etapa, detalhe }));
  const geracaoId = (e as { geracaoId?: string })?.geracaoId;
  return json({ erro: { codigo, mensagem, etapa }, ...(geracaoId ? { geracao_id: geracaoId } : {}) }, status);
}

async function corpo<T>(req: Request, esquema: z.ZodType<T>): Promise<T> {
  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    throw erros.invalida("Corpo da requisição inválido.");
  }
  const r = esquema.safeParse(bruto);
  if (!r.success) throw erros.invalida("Dados incompletos: " + r.error.issues.map((i) => i.path.join(".")).join(", "));
  return r.data;
}

function rota(f: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await f(req);
    } catch (e) {
      return respostaDeErro(e);
    }
  };
}

const Uuid = z.string().uuid();

export function criarRotas(fab: Fabricas) {
  const deps = (ctx: Contexto, extra: Partial<Deps> = {}): Deps => ({
    ia: fab.ia(),
    repo: fab.repo(ctx),
    prompts: fab.prompts,
    fetch: fab.fetch,
    agora: fab.agora,
    ...extra,
  });

  return {
    /**
     * Gera a aula e transmite o progresso em NDJSON (uma linha JSON por evento):
     * {"etapa":"pesquisa"} … {"etapa":"pronto","id":"…"} ou {"erro":{…}}.
     */
    aula: rota(async (req) => {
      const ctx = await fab.autenticar(req);
      const dados = await corpo(
        req,
        z.object({ geracao_id: Uuid, trimestre_id: Uuid, passo: z.enum(["nucleo", "paralela"]), novas_fontes: z.boolean().optional() }),
      );
      const ia = fab.ia(); // sem chave: erro JSON antes de abrir o stream
      const codificador = new TextEncoder();
      const corpoStream = new ReadableStream<Uint8Array>({
        async start(controle) {
          const enviar = (o: unknown) => {
            try {
              controle.enqueue(codificador.encode(JSON.stringify(o) + "\n"));
            } catch {
              // o navegador fechou a conexão; a geração continua e fica salva no checkpoint
            }
          };
          try {
            const r = await gerarAula(deps(ctx, { ia, progresso: enviar }), {
              geracaoId: dados.geracao_id,
              trimestreId: dados.trimestre_id,
              passo: dados.passo,
              novasFontes: dados.novas_fontes,
            });
            enviar({ etapa: "pronto", ...r });
          } catch (e) {
            const c = classificarErro(e);
            if (c.detalhe) console.error("[aula] erro", JSON.stringify({ codigo: c.codigo, etapa: c.etapa, detalhe: c.detalhe }));
            enviar({ erro: { codigo: c.codigo, mensagem: c.mensagem, etapa: c.etapa }, geracao_id: (e as { geracaoId?: string }).geracaoId ?? dados.geracao_id });
          }
          try {
            controle.close();
          } catch {}
        },
      });
      return new Response(corpoStream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
    }),

    /** Estado de uma geração (sem chamar a IA): usado quando outra aba já está gerando. */
    aulaStatus: rota(async (req) => {
      const ctx = await fab.autenticar(req);
      const { geracao_id } = await corpo(req, z.object({ geracao_id: Uuid }));
      const g = await fab.repo(ctx).geracao(geracao_id);
      if (!g) throw erros.naoEncontrado("Geração");
      const agora = fab.agora?.() ?? new Date();
      return json({
        status: g.status,
        aula_id: g.aula_id,
        etapa_falha: g.etapa_falha,
        erro: g.erro,
        em_andamento: Boolean(g.em_execucao_ate && new Date(g.em_execucao_ate) > agora),
      });
    }),

    explicar: rota(async (req) => {
      const ctx = await fab.autenticar(req);
      const { aula_id, bloco } = await corpo(req, z.object({ aula_id: Uuid, bloco: z.number().int().min(0).max(50) }));
      return json(await explicarDeOutroJeito(deps(ctx), aula_id, bloco));
    }),

    feynman: rota(async (req) => {
      const ctx = await fab.autenticar(req);
      const { tema_id, explicacao } = await corpo(req, z.object({ tema_id: Uuid, explicacao: z.string() }));
      return json(await avaliarFeynman(deps(ctx), tema_id, explicacao));
    }),

    buscarPdf: rota(async (req) => {
      const ctx = await fab.autenticar(req);
      const { consulta } = await corpo(req, z.object({ consulta: z.string() }));
      try {
        return json(await buscarPdfLegal(deps(ctx), consulta));
      } catch (e) {
        throw comEtapa(e, "busca_pdf");
      }
    }),

    /** Se a chave existe (sem revelar o valor) e como está o gasto do mês. */
    status: rota(async (req) => {
      const ctx = await fab.autenticar(req);
      const repo = fab.repo(ctx);
      const [cfg, uso] = await Promise.all([repo.config(), repo.consumo()]);
      const fracao = cfg.tetoMensal > 0 ? uso.custoMes / cfg.tetoMensal : uso.custoMes > 0 ? 1 : 0;
      return json({
        configurada: fab.iaConfigurada(),
        custo_mes: uso.custoMes,
        teto_mensal: cfg.tetoMensal,
        chamadas_hoje: uso.chamadasHoje,
        limite_diario: cfg.limiteDiario,
        alerta: fracao >= 1 ? "bloqueado" : fracao >= 0.8 ? "perto_do_teto" : null,
      });
    }),

    processar: rota(async (req) => {
      const ctx = await fab.autenticar(req);
      const { arquivo_id } = await corpo(req, z.object({ arquivo_id: Uuid }));
      try {
        return json(await fab.processar(ctx.sb, arquivo_id));
      } catch (e) {
        throw comEtapa(e, "biblioteca");
      }
    }),

    importar: rota(async (req) => {
      const { sb, userId } = await fab.autenticar(req);
      const dados = await corpo(
        req,
        z.object({ url: z.string().url(), titulo: z.string().min(1).max(300), autor: z.string().max(200).nullable().optional(), recurso_id: Uuid.nullable().optional() }),
      );
      const { bytes, formato, urlFinal } = await baixarObraAberta(dados.url, fab.fetch);
      const caminho = `${userId}/${crypto.randomUUID()}.${formato}`;
      const tipos = { pdf: "application/pdf", epub: "application/epub+zip", txt: "text/plain", html: "text/html" };
      const up = await sb.storage.from("biblioteca").upload(caminho, bytes, { contentType: tipos[formato], upsert: false });
      if (up.error) throw new ErroApp("arquivo_invalido", 502, "Biblioteca: não consegui guardar o arquivo (" + up.error.message + ").", "biblioteca");
      const { data: arq, error } = await sb
        .from("biblioteca_arquivos")
        .insert({
          titulo: dados.titulo,
          autor: dados.autor ?? null,
          formato,
          caminho,
          tamanho_bytes: bytes.byteLength,
          origem: "fonte_aberta",
          fonte_url: urlFinal,
          recurso_id: dados.recurso_id ?? null,
        })
        .select("id")
        .single();
      if (error || !arq) throw new ErroApp("erro_interno", 500, "Biblioteca: não consegui registrar o arquivo.", "biblioteca");
      await fab.processar(sb, arq.id, bytes);
      return json({ id: arq.id });
    }),
  };
}
