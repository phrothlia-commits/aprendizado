import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ErroApp } from "../ia/erros";
import { agruparPorLivro, dividirEmTrechos, htmlParaTexto, lerClippings, secoesDeEpub, secoesDePdf, secoesDeTexto, type Secao, type Trecho } from "./extrair";

type Arquivo = { id: string; titulo: string; autor: string | null; formato: string; caminho: string; recurso_id: string | null };

async function inserirTrechos(sb: SupabaseClient, arquivoId: string, trechos: Trecho[]) {
  await sb.from("biblioteca_trechos").delete().eq("arquivo_id", arquivoId);
  for (let i = 0; i < trechos.length; i += 200) {
    const lote = trechos.slice(i, i + 200).map((t) => ({ arquivo_id: arquivoId, ordem: t.ordem, capitulo: t.capitulo, pagina: t.pagina, texto: t.texto }));
    const { error } = await sb.from("biblioteca_trechos").insert(lote);
    if (error) throw new Error(error.message);
  }
}

async function concluir(sb: SupabaseClient, id: string, campos: Record<string, unknown>) {
  await sb.from("biblioteca_arquivos").update(campos).eq("id", id);
}

/**
 * Baixa o arquivo do Storage (com o token do usuário), extrai, divide e indexa.
 * Destaques do Kindle: um arquivo vira um registro por livro, com os destaques como trechos.
 */
export async function processarArquivo(sb: SupabaseClient, arquivoId: string, bytesProntos?: Uint8Array) {
  const { data: arq, error } = await sb.from("biblioteca_arquivos").select("id, titulo, autor, formato, caminho, recurso_id").eq("id", arquivoId).maybeSingle();
  if (error || !arq) throw new Error("Arquivo não encontrado.");
  const a = arq as Arquivo;
  try {
    let bytes = bytesProntos;
    if (!bytes) {
      const { data, error: e } = await sb.storage.from("biblioteca").download(a.caminho);
      if (e || !data) throw new Error("Não consegui ler o arquivo no armazenamento.");
      bytes = new Uint8Array(await data.arrayBuffer());
    }

    if (a.formato === "kindle") {
      const livros = [...agruparPorLivro(lerClippings(new TextDecoder().decode(bytes))).values()];
      if (!livros.length) throw new Error("Não encontrei destaques no arquivo. Envie o My Clippings.txt do Kindle.");
      const criados: string[] = [];
      for (const [i, destaques] of livros.entries()) {
        const { titulo, autor } = destaques[0];
        let id = a.id;
        if (i === 0) {
          await concluir(sb, a.id, { titulo, autor });
        } else {
          const { data: novo, error: e } = await sb
            .from("biblioteca_arquivos")
            .insert({ titulo, autor, formato: "kindle", caminho: a.caminho, origem: "upload", status: "processando" })
            .select("id")
            .single();
          if (e || !novo) throw new Error(e?.message ?? "Falha ao criar livro do Kindle");
          id = novo.id;
        }
        const trechos: Trecho[] = destaques.map((d, k) => ({
          ordem: k + 1,
          capitulo: d.posicao ? `Posição ${d.posicao}` : null,
          pagina: d.pagina,
          texto: d.texto,
        }));
        await inserirTrechos(sb, id, trechos);
        await concluir(sb, id, { status: "pronto", erro: null, total_trechos: trechos.length });
        criados.push(id);
      }
      return { ids: criados };
    }

    let secoes: Secao[];
    const campos: Record<string, unknown> = {};
    if (a.formato === "pdf") secoes = await secoesDePdf(bytes);
    else if (a.formato === "epub") {
      const r = secoesDeEpub(bytes);
      secoes = r.secoes;
      if (r.autor && !a.autor) campos.autor = r.autor;
    } else if (a.formato === "html") secoes = secoesDeTexto(htmlParaTexto(new TextDecoder().decode(bytes)));
    else secoes = secoesDeTexto(new TextDecoder().decode(bytes));

    const trechos = dividirEmTrechos(secoes);
    if (!trechos.length) throw new Error("Não encontrei texto no arquivo.");
    await inserirTrechos(sb, a.id, trechos);
    await concluir(sb, a.id, { ...campos, status: "pronto", erro: null, total_trechos: trechos.length });
    return { ids: [a.id] };
  } catch (e) {
    const mensagem = (e as Error).message.slice(0, 300);
    await concluir(sb, a.id, { status: "erro", erro: mensagem });
    throw e instanceof ErroApp ? e : new ErroApp("arquivo_invalido", 422, mensagem);
  }
}
