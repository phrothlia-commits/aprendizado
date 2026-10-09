/** Acesso ao banco (Supabase). Toda regra de negócio fica em módulos puros. */
import { revisarCartao, type Algoritmo, type Botao } from "./agendamento";
import { dataLocal, fimDoDia, inicioDoDia, somarDias } from "./datas";
import { montarSeed } from "./seed";
import { supabase } from "./supabase";
import {
  TABELAS_EXPORTACAO,
  type Cartao,
  type Configuracoes,
  type Diario,
  type Habito,
  type Idioma,
  type Pilar,
  type Tema,
  type Trimestre,
} from "./tipos";

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

const CONFIG_PADRAO: Configuracoes = { novos_por_dia: 10, revisoes_por_dia: 150, algoritmo: "fsrs" };

// --- Carga inicial ------------------------------------------------------------

export async function semearSeNecessario(): Promise<boolean> {
  return ok(await supabase().rpc("semear", { payload: montarSeed() })) as boolean;
}

// --- Base (pilares, temas, configurações) ------------------------------------------

export async function carregarBase(): Promise<{ pilares: Pilar[]; temas: Tema[]; config: Configuracoes }> {
  const sb = supabase();
  const [p, t, c] = await Promise.all([
    sb.from("pilares").select("*").order("numero"),
    sb.from("temas").select("*").order("created_at"),
    sb.from("configuracoes").select("novos_por_dia, revisoes_por_dia, algoritmo").maybeSingle(),
  ]);
  const pilares = ok(p) as Pilar[];
  // Base física (0) vai para o fim da lista.
  pilares.sort((a, b) => (a.numero || 99) - (b.numero || 99));
  return { pilares, temas: ok(t) as Tema[], config: (ok(c) as Configuracoes | null) ?? CONFIG_PADRAO };
}

export async function salvarConfig(c: Configuracoes) {
  ok(await supabase().from("configuracoes").upsert(c).select());
}

// --- Hoje ----------------------------------------------------------------------

export async function dadosHoje(agora = new Date()) {
  const sb = supabase();
  const hoje = dataLocal(agora);
  const [trim, hab, dia, venc, novos, revHoje, dias] = await Promise.all([
    sb.from("trimestres").select("*").order("data_inicio"),
    sb.from("habitos").select("*").eq("data", hoje).maybeSingle(),
    sb.from("diarios").select("*").eq("data", hoje).maybeSingle(),
    sb
      .from("cartoes")
      .select("id", { count: "exact", head: true })
      .eq("suspenso", false)
      .lte("proxima_revisao", fimDoDia(agora).toISOString()),
    sb.from("cartoes").select("id", { count: "exact", head: true }).eq("suspenso", false).is("proxima_revisao", null),
    sb.from("revisoes").select("era_novo").gte("revisado_em", inicioDoDia(agora).toISOString()),
    sb.rpc("dias_ativos", { fuso: Intl.DateTimeFormat().resolvedOptions().timeZone, desde: somarDias(hoje, -400) }),
  ]);
  const revisoes = ok(revHoje) as { era_novo: boolean }[];
  ok(venc);
  ok(novos);
  return {
    hoje,
    trimestres: ok(trim) as Trimestre[],
    habito: ok(hab) as Habito | null,
    diario: ok(dia) as Diario | null,
    vencidos: venc.count ?? 0,
    novosDisponiveis: novos.count ?? 0,
    revisoesHoje: revisoes.length,
    novosHoje: revisoes.filter((r) => r.era_novo).length,
    diasAtivos: (ok(dias) as string[]) ?? [],
  };
}

export async function salvarHabito(data: string, patch: Partial<Pick<Habito, "modo" | "checklist" | "horas_sono" | "minutos_exercicio" | "novidade">>) {
  return ok(await supabase().from("habitos").upsert({ data, ...patch }, { onConflict: "user_id,data" }).select().single()) as Habito;
}

export async function registrarSabedoria(data: string, livro: string, referencia: string, lida: boolean) {
  const sb = supabase();
  if (lida) {
    ok(
      await sb
        .from("passagens_sabedoria")
        .upsert({ data_lida: data, livro, referencia }, { onConflict: "user_id,data_lida,referencia" })
        .select(),
    );
  } else {
    ok(await sb.from("passagens_sabedoria").delete().eq("data_lida", data).eq("referencia", referencia));
  }
}

// --- Revisão ------------------------------------------------------------------------

const CAMPOS_REVISAO = "id, frente, verso, tipo, tags, pilar_id, tema_id, agendamento, proxima_revisao, posicao, suspenso";

export async function cartoesParaRevisar(agora = new Date()) {
  const sb = supabase();
  const [v, n, r] = await Promise.all([
    sb
      .from("cartoes")
      .select(CAMPOS_REVISAO)
      .eq("suspenso", false)
      .lte("proxima_revisao", fimDoDia(agora).toISOString())
      .order("proxima_revisao")
      .limit(2000),
    sb.from("cartoes").select(CAMPOS_REVISAO).eq("suspenso", false).is("proxima_revisao", null).order("posicao").limit(500),
    sb.from("revisoes").select("era_novo").gte("revisado_em", inicioDoDia(agora).toISOString()),
  ]);
  const revisoes = ok(r) as { era_novo: boolean }[];
  return {
    vencidos: ok(v) as Cartao[],
    novos: ok(n) as Cartao[],
    revisoesHoje: revisoes.length,
    novosHoje: revisoes.filter((x) => x.era_novo).length,
  };
}

export async function registrarRevisao(cartao: Pick<Cartao, "id" | "agendamento" | "proxima_revisao">, botao: Botao, tempoMs: number, algoritmo: Algoritmo, agora = new Date()) {
  const r = revisarCartao(cartao.agendamento, botao, agora, algoritmo);
  const sb = supabase();
  const [u, i] = await Promise.all([
    sb
      .from("cartoes")
      .update({ agendamento: r.estado, proxima_revisao: r.proximaRevisao.toISOString() })
      .eq("id", cartao.id),
    sb.from("revisoes").insert({
      cartao_id: cartao.id,
      revisado_em: agora.toISOString(),
      botao,
      tempo_resposta_ms: Math.round(tempoMs),
      intervalo_anterior: r.intervaloAnteriorDias,
      intervalo_novo: r.intervaloNovoDias,
      era_novo: cartao.proxima_revisao === null,
    }),
  ]);
  ok(u);
  ok(i);
  return r;
}

// --- Cartões --------------------------------------------------------------------------

export type NovoCartao = Pick<Cartao, "frente" | "verso" | "tipo" | "pilar_id" | "tema_id" | "tags"> & {
  fonte?: string | null;
  origem?: Cartao["origem"];
};

export async function buscarCartoes(f: { texto?: string; pilarId?: string; tag?: string; limite?: number }) {
  let q = supabase().from("cartoes").select("*").order("created_at", { ascending: false }).limit(f.limite ?? 200);
  if (f.pilarId) q = q.eq("pilar_id", f.pilarId);
  if (f.tag) q = q.contains("tags", [f.tag]);
  if (f.texto) {
    const t = f.texto.replace(/[%,()]/g, " ").trim();
    if (t) q = q.or(`frente.ilike.%${t}%,verso.ilike.%${t}%`);
  }
  return ok(await q) as Cartao[];
}

export async function contarCartoes() {
  const r = await supabase().from("cartoes").select("id", { count: "exact", head: true });
  ok(r);
  return r.count ?? 0;
}

export async function criarCartoes(cartoes: NovoCartao[]) {
  if (!cartoes.length) return [];
  return ok(await supabase().from("cartoes").insert(cartoes).select()) as Cartao[];
}

export async function atualizarCartao(id: string, patch: Partial<NovoCartao & { suspenso: boolean }>) {
  return ok(await supabase().from("cartoes").update(patch).eq("id", id).select().single()) as Cartao;
}

export async function excluirCartao(id: string) {
  ok(await supabase().from("cartoes").delete().eq("id", id));
}

export async function todasTags(): Promise<string[]> {
  return (ok(await supabase().rpc("tags_cartoes")) as string[]) ?? [];
}

// --- Trilha -----------------------------------------------------------------------------

export async function dadosTrilha() {
  const sb = supabase();
  const [t, i, c] = await Promise.all([
    sb.from("trimestres").select("*").order("ordem"),
    sb.from("idiomas").select("*").order("created_at"),
    sb.from("ciclos").select("*").order("numero"),
  ]);
  return {
    trimestres: ok(t) as Trimestre[],
    idiomas: ok(i) as Idioma[],
    ciclos: ok(c) as { id: string; numero: number; nivel: string; data_inicio: string; data_fim: string }[],
  };
}

export async function atualizarTema(id: string, patch: Partial<Pick<Tema, "nivel" | "status" | "feynman_ok" | "explicacao_feynman">>) {
  return ok(await supabase().from("temas").update(patch).eq("id", id).select().single()) as Tema;
}

/** Troca núcleo e paralela entre dois trimestres (as datas ficam). Nenhum tema é removido. */
export async function trocarTrimestres(a: Trimestre, b: Trimestre) {
  const conteudo = (t: Trimestre) => ({
    nucleo_titulo: t.nucleo_titulo,
    tema_nucleo_id: t.tema_nucleo_id,
    paralela_titulo: t.paralela_titulo,
    tema_paralelo_id: t.tema_paralelo_id,
  });
  const sb = supabase();
  ok(await sb.from("trimestres").update(conteudo(b)).eq("id", a.id));
  ok(await sb.from("trimestres").update(conteudo(a)).eq("id", b.id));
}

export async function salvarNotasTrimestre(id: string, notas: string) {
  ok(await supabase().from("trimestres").update({ notas_revisao: notas }).eq("id", id));
}

// --- Diário ---------------------------------------------------------------------------------

export async function salvarDiario(d: Pick<Diario, "data" | "aprendizado_1" | "aprendizado_2" | "aprendizado_3" | "tags">) {
  return ok(await supabase().from("diarios").upsert(d, { onConflict: "user_id,data" }).select().single()) as Diario;
}

export async function buscarDiarios(texto: string, limite = 60) {
  let q = supabase().from("diarios").select("*").order("data", { ascending: false }).limit(limite);
  const t = texto.replace(/[%,()]/g, " ").trim();
  if (t) q = q.or(`aprendizado_1.ilike.%${t}%,aprendizado_2.ilike.%${t}%,aprendizado_3.ilike.%${t}%`);
  return ok(await q) as Diario[];
}

// --- Exportação ---------------------------------------------------------------------------------

/** Lê a tabela inteira, de 1000 em 1000 (limite padrão de linhas da API do Supabase). */
export async function lerTudo<T = Record<string, unknown>>(tabela: string): Promise<T[]> {
  const sb = supabase();
  const linhas: T[] = [];
  for (let de = 0; ; de += 1000) {
    const pagina = ok(await sb.from(tabela).select("*").order("created_at").range(de, de + 999)) as T[];
    linhas.push(...pagina);
    if (pagina.length < 1000) return linhas;
  }
}

export function todosCartoes() {
  return lerTudo<Cartao>("cartoes");
}

export async function exportarTudo(): Promise<Record<string, Record<string, unknown>[]>> {
  const saida: Record<string, Record<string, unknown>[]> = {};
  for (const tabela of TABELAS_EXPORTACAO) saida[tabela] = await lerTudo(tabela);
  return saida;
}
