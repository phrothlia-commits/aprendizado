import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ErroApp } from "./ia/erros";
import { LIMITE_DIARIO_PADRAO, MAX_BUSCAS_PADRAO, modeloValido, TETO_MENSAL_PADRAO } from "./ia/modelos";
import type { AulaSalva } from "./ia/schemas";
import type { ConfigIA, Geracao, Repo } from "./ia/tipos";

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

const FUSO = "America/Sao_Paulo";

/** Tabela da migração 0003 ausente: mensagem clara em vez de erro técnico. */
function okGeracao<T>(r: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (r.error && (r.error.code === "42P01" || r.error.code === "PGRST205" || /geracoes/.test(r.error.message)))
    throw new ErroApp("erro_interno", 500, "Falta rodar a migração 0003_ia_otimizacao.sql no Supabase (SQL Editor). Depois, tente de novo.");
  return ok(r);
}
const COLUNAS_GERACAO = "id, trimestre_id, passo, status, etapa_falha, checkpoint, erro, aula_id, em_execucao_ate";

type LinhaConfig = Partial<{
  ia_limite_diario: number;
  ia_teto_mensal_usd: number | string;
  ia_max_buscas: number;
  ia_nivel: ConfigIA["nivel"];
  ia_modelo_pesquisa: string;
  ia_modelo_composicao: string;
  ia_modelo_feynman: string;
  ia_modelo_explicar: string;
  ia_modelo_reparo: string;
}>;

export function configDeLinha(c: LinhaConfig | null): ConfigIA {
  return {
    limiteDiario: c?.ia_limite_diario ?? LIMITE_DIARIO_PADRAO,
    tetoMensal: c?.ia_teto_mensal_usd != null ? Number(c.ia_teto_mensal_usd) : TETO_MENSAL_PADRAO,
    maxBuscas: c?.ia_max_buscas ?? MAX_BUSCAS_PADRAO,
    nivel: c?.ia_nivel ?? "iniciante",
    modelos: {
      pesquisa: modeloValido("pesquisa", c?.ia_modelo_pesquisa),
      composicao: modeloValido("composicao", c?.ia_modelo_composicao),
      feynman: modeloValido("feynman", c?.ia_modelo_feynman),
      explicar: modeloValido("explicar", c?.ia_modelo_explicar),
      reparo: modeloValido("reparo", c?.ia_modelo_reparo),
    },
  };
}

/** Implementação do repositório sobre o Supabase, com o RLS do usuário. */
export function repoSupabase(sb: SupabaseClient): Repo {
  return {
    async config() {
      // select("*") funciona antes e depois da migração 0003 (colunas novas ausentes viram padrão).
      const c = ok(await sb.from("configuracoes").select("*").maybeSingle()) as LinhaConfig | null;
      return configDeLinha(c);
    },
    async consumo() {
      const r = ok(await sb.rpc("resumo_ia", { fuso: FUSO })) as { chamadas_hoje: number; custo_mes: number }[];
      return { chamadasHoje: Number(r?.[0]?.chamadas_hoje ?? 0), custoMes: Number(r?.[0]?.custo_mes ?? 0) };
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
      const [pilar, recursos, anteriores, seguintes] = await Promise.all([
        tema ? sb.from("pilares").select("numero, nome").eq("id", tema.pilar_id).maybeSingle().then(ok) : Promise.resolve(null),
        tema ? sb.from("recursos").select("titulo, autor").eq("tema_id", tema.id).limit(8).then(ok) : Promise.resolve([]),
        sb.from("aulas").select("titulo, conteudo->>objetivo").eq("trimestre_id", trimestreId).eq("passo", passo).order("created_at").limit(30).then(ok),
        sb
          .from("trimestres")
          .select("ordem, periodo, nucleo_titulo, paralela_titulo")
          .gt("ordem", Number(t.ordem))
          .eq("ciclo_id", String(t.ciclo_id))
          .order("ordem")
          .limit(2)
          .then(ok),
      ]);
      const aulas = (anteriores ?? []) as { titulo: string; objetivo: string | null }[];
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
        pilar: pilar as { numero: number; nome: string } | null,
        recursos: (recursos ?? []) as { titulo: string; autor: string | null }[],
        aulasAnteriores: aulas.map((a) => a.titulo),
        ultimas: aulas.slice(-2).map((a) => ({ titulo: a.titulo, resumo: a.objetivo ?? "" })),
        proximas: ((seguintes ?? []) as { ordem: number; periodo: string; nucleo_titulo: string; paralela_titulo: string }[]).map((s) => ({
          titulo: `Trimestre ${s.ordem} (${s.periodo})`,
          resumo: passo === "nucleo" ? s.nucleo_titulo : s.paralela_titulo,
        })),
      };
    },
    async dadosPerfil(temaId) {
      const aulasQ = sb.from("aulas").select("titulo, conteudo->pre_teste, respostas").not("estudada_em", "is", null).order("estudada_em", { ascending: false }).limit(20);
      const [aulas, revisoes, feynman] = await Promise.all([
        (temaId ? aulasQ.eq("tema_id", temaId) : aulasQ).then(ok),
        sb.from("revisoes").select("cartao_id, cartoes!inner(frente, tema_id)").eq("botao", 1).order("revisado_em", { ascending: false }).limit(300).then((r) => (r.error ? [] : (r.data ?? []))),
        temaId ? sb.from("feynman").select("avaliacao->lacunas").eq("tema_id", temaId).order("created_at", { ascending: false }).limit(3).then((r) => (r.error ? [] : (r.data ?? []))) : Promise.resolve([]),
      ]);
      const lista = (aulas ?? []) as { titulo: string; pre_teste: { pergunta: string; resposta: string }[] | null; respostas: { pre_ok?: boolean[] } | null }[];
      const erradas = new Map<string, { frente: string; n: number }>();
      for (const r of revisoes as unknown as { cartao_id: string; cartoes: { frente: string; tema_id: string | null } }[]) {
        if (temaId && r.cartoes.tema_id !== temaId) continue;
        const e = erradas.get(r.cartao_id) ?? { frente: r.cartoes.frente, n: 0 };
        e.n++;
        erradas.set(r.cartao_id, e);
      }
      const preTesteErrado = lista.slice(0, 3).flatMap((a) => (a.pre_teste ?? []).filter((_, i) => a.respostas?.pre_ok?.[i] === false));
      return {
        aulasConcluidas: lista.map((a) => a.titulo).reverse(),
        cartoesMaisErrados: [...erradas.values()].sort((a, b) => b.n - a.n).map((e) => e.frente),
        lacunasFeynman: (feynman as { lacunas: string[] | null }[]).flatMap((f) => f.lacunas ?? []),
        preTesteErrado,
      };
    },
    async frentesCartoes() {
      const { data, error } = await sb.from("cartoes").select("frente").order("created_at", { ascending: false }).limit(3000);
      return error ? [] : (data ?? []).map((c: { frente: string }) => c.frente);
    },

    async geracao(id) {
      return okGeracao(await sb.from("geracoes").select(COLUNAS_GERACAO).eq("id", id).maybeSingle()) as Geracao | null;
    },
    async geracaoAberta(trimestreId, passo) {
      return ok(await sb.from("geracoes").select(COLUNAS_GERACAO).eq("trimestre_id", trimestreId).eq("passo", passo).neq("status", "concluida").maybeSingle()) as Geracao | null;
    },
    async criarGeracao(g) {
      const { data, error } = await sb.from("geracoes").insert(g).select(COLUNAS_GERACAO).single();
      if (error) {
        if (error.code === "23505") return null; // já existe uma aberta (outra aba ganhou a corrida)
        throw new Error(error.message);
      }
      return data as Geracao;
    },
    async travarGeracao(id, ate, agora) {
      // UPDATE condicional é atômico no Postgres: só uma requisição consegue a trava.
      const { data, error } = await sb
        .from("geracoes")
        .update({ em_execucao_ate: ate.toISOString(), erro: null })
        .eq("id", id)
        .neq("status", "concluida")
        .or(`em_execucao_ate.is.null,em_execucao_ate.lt."${agora.toISOString()}"`)
        .select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
    async atualizarGeracao(id, patch) {
      ok(await sb.from("geracoes").update(patch).eq("id", id));
    },

    async fontesTema(chave) {
      const { data, error } = await sb.from("fontes_tema").select("fontes, custo_usd, buscado_em").eq("chave", chave).maybeSingle();
      if (error || !data) return null;
      return { fontes: data.fontes, custo_usd: Number(data.custo_usd), buscado_em: data.buscado_em };
    },
    async salvarFontesTema(chave, fontes, custo) {
      const { error } = await sb
        .from("fontes_tema")
        .upsert({ chave, fontes, custo_usd: custo, buscado_em: new Date().toISOString() }, { onConflict: "user_id,chave" });
      if (error) console.error("Falha ao guardar o cache de fontes:", error.message);
    },
    async dominiosBloqueados() {
      const { data, error } = await sb.from("ia_dominios_bloqueados").select("dominio");
      return error ? [] : (data ?? []).map((d: { dominio: string }) => d.dominio);
    },
    async registrarDominiosBloqueados(dominios) {
      for (const d of dominios) {
        const { error } = await sb.rpc("registrar_dominio_bloqueado", { d });
        if (error) console.error("Falha ao registrar domínio bloqueado:", error.message);
      }
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
    async aula(id) {
      return ok(await sb.from("aulas").select("id, tema_id, conteudo").eq("id", id).maybeSingle()) as { id: string; tema_id: string | null; conteudo: AulaSalva } | null;
    },
    async atualizarConteudoAula(id, conteudo) {
      ok(await sb.from("aulas").update({ conteudo }).eq("id", id));
    },
    async aulasDoTema(temaId, limite) {
      const r = ok(await sb.from("aulas").select("conteudo").eq("tema_id", temaId).order("created_at", { ascending: false }).limit(limite)) as { conteudo: AulaSalva }[];
      return r.map((a) => a.conteudo);
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
