import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repo } from "./ia/servicos";

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

const FUSO = "America/Sao_Paulo";

/** Implementação do repositório sobre o Supabase, com o RLS do usuário. */
export function repoSupabase(sb: SupabaseClient): Repo {
  return {
    async limiteDiario() {
      const c = ok(await sb.from("configuracoes").select("ia_limite_diario").maybeSingle()) as { ia_limite_diario: number } | null;
      return c?.ia_limite_diario ?? 20;
    },
    async chamadasHoje() {
      const r = ok(await sb.rpc("resumo_ia", { fuso: FUSO })) as { chamadas_hoje: number }[];
      return Number(r?.[0]?.chamadas_hoje ?? 0);
    },
    async registrarChamada(r) {
      // Falha no log não pode derrubar a aula: registra no console e segue.
      const { error } = await sb.from("ia_chamadas").insert(r);
      if (error) console.error("Falha ao registrar chamada de IA:", error.message);
    },
    async buscarTrechos(consulta, limite) {
      const { data, error } = await sb.rpc("buscar_trechos", { consulta, arquivos: null, limite });
      if (error) return [];
      return (data ?? []).map((t: { arquivo_id: string; titulo: string; autor: string | null; capitulo: string | null; pagina: number | null; texto: string }) => ({
        arquivo_id: t.arquivo_id,
        titulo: t.titulo,
        autor: t.autor,
        capitulo: t.capitulo,
        pagina: t.pagina,
        texto: t.texto,
      }));
    },
    async contextoPasso(trimestreId, passo) {
      const t = ok(await sb.from("trimestres").select("*").eq("id", trimestreId).maybeSingle()) as Record<string, string | number | null> | null;
      if (!t) throw new Error("Trimestre não encontrado");
      const temaId = (passo === "nucleo" ? t.tema_nucleo_id : t.tema_paralelo_id) as string | null;
      const tema = temaId ? (ok(await sb.from("temas").select("id, nome, nivel, pilar_id").eq("id", temaId).maybeSingle()) as { id: string; nome: string; nivel: string; pilar_id: string } | null) : null;
      const pilar = tema ? (ok(await sb.from("pilares").select("numero, nome").eq("id", tema.pilar_id).maybeSingle()) as { numero: number; nome: string } | null) : null;
      const recursos = tema ? (ok(await sb.from("recursos").select("titulo, autor").eq("tema_id", tema.id).limit(8)) as { titulo: string; autor: string | null }[]) : [];
      const anteriores = ok(
        await sb.from("aulas").select("titulo").eq("trimestre_id", trimestreId).eq("passo", passo).order("created_at").limit(30),
      ) as { titulo: string }[];
      return {
        trimestre: {
          id: String(t.id),
          ordem: Number(t.ordem),
          periodo: String(t.periodo),
          titulo: String(passo === "nucleo" ? t.nucleo_titulo : t.paralela_titulo),
          tema_id: temaId,
        },
        passo,
        tema: tema ? { id: tema.id, nome: tema.nome, nivel: tema.nivel } : null,
        pilar,
        recursos,
        aulasAnteriores: anteriores.map((a) => a.titulo),
      };
    },
    async salvarAula(a) {
      return ok(await sb.from("aulas").insert(a).select("id").single()) as { id: string };
    },
    async salvarFontes(aulaId, temaId, fontes) {
      if (!fontes.length) return;
      const linhas = fontes.map((f) => ({
        aula_id: aulaId,
        tema_id: temaId,
        tipo: f.tipo,
        categoria: f.categoria,
        titulo: f.titulo,
        autor: f.autor ?? null,
        url: f.url,
        gratuita: f.gratuita,
        acesso: f.acesso,
        permite_download: f.permiteDownload,
        verificado_em: new Date().toISOString(),
      }));
      const { error } = await sb.from("fontes").upsert(linhas, { onConflict: "user_id,url", ignoreDuplicates: false });
      if (error) console.error("Falha ao salvar fontes:", error.message);
    },
    async tema(temaId) {
      const t = ok(await sb.from("temas").select("id, nome, nivel, pilar_id").eq("id", temaId).maybeSingle()) as { id: string; nome: string; nivel: string; pilar_id: string } | null;
      if (!t) return null;
      const p = ok(await sb.from("pilares").select("nome").eq("id", t.pilar_id).maybeSingle()) as { nome: string } | null;
      return { id: t.id, nome: t.nome, nivel: t.nivel, pilar: p?.nome ?? null };
    },
    async salvarFeynman(f) {
      return ok(await sb.from("feynman").insert(f).select("id, created_at").single()) as { id: string; created_at: string };
    },
  };
}
