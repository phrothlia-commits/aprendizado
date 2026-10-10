/**
 * Handlers das rotas de API, separados dos arquivos route.ts para serem
 * testados com dependências falsas (sem rede, sem banco, sem chave).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { baixarObraAberta } from "./biblioteca/importar";
import { classificarErro, ErroApp, erros } from "./ia/erros";
import { avaliarFeynman, buscarPdfLegal, gerarAula, type Deps } from "./ia/servicos";

export type Contexto = { sb: SupabaseClient; userId: string };

export type Fabricas = {
  autenticar(req: Request): Promise<Contexto>;
  /** Lança `erros.semChave()` quando ANTHROPIC_API_KEY não existe. */
  deps(ctx: Contexto): Deps;
  processar(sb: SupabaseClient, arquivoId: string, bytes?: Uint8Array): Promise<{ ids: string[] }>;
  fetch?: typeof fetch;
};

export function json(dados: unknown, status = 200) {
  return Response.json(dados, { status, headers: { "cache-control": "no-store" } });
}

export function respostaDeErro(e: unknown) {
  const { codigo, status, mensagem } = classificarErro(e);
  if (status >= 500 && codigo === "erro_interno") console.error(e);
  return json({ erro: { codigo, mensagem } }, status);
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
  return {
    aula: rota(async (req) => {
      const ctx = await fab.autenticar(req);
      const { trimestre_id, passo } = await corpo(req, z.object({ trimestre_id: Uuid, passo: z.enum(["nucleo", "paralela"]) }));
      const { id } = await gerarAula(fab.deps(ctx), trimestre_id, passo);
      return json({ id });
    }),

    feynman: rota(async (req) => {
      const ctx = await fab.autenticar(req);
      const { tema_id, explicacao } = await corpo(req, z.object({ tema_id: Uuid, explicacao: z.string() }));
      return json(await avaliarFeynman(fab.deps(ctx), tema_id, explicacao));
    }),

    buscarPdf: rota(async (req) => {
      const ctx = await fab.autenticar(req);
      const { consulta } = await corpo(req, z.object({ consulta: z.string() }));
      return json(await buscarPdfLegal(fab.deps(ctx), consulta));
    }),

    processar: rota(async (req) => {
      const ctx = await fab.autenticar(req);
      const { arquivo_id } = await corpo(req, z.object({ arquivo_id: Uuid }));
      return json(await fab.processar(ctx.sb, arquivo_id));
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
      if (up.error) throw new ErroApp("arquivo_invalido", 502, "Não consegui guardar o arquivo: " + up.error.message);
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
      if (error || !arq) throw new ErroApp("erro_interno", 500, "Não consegui registrar o arquivo.");
      await fab.processar(sb, arq.id, bytes);
      return json({ id: arq.id });
    }),
  };
}
