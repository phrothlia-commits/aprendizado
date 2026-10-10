/** Cliente das rotas de IA e dados da camada de IA (aulas, fontes, Feynman, biblioteca). */
import { criarCartoes, type NovoCartao } from "./db";
import { dataLocal } from "./datas";
import { supabase } from "./supabase";
import type { ArquivoBiblioteca, Aula, AvaliacaoFeynman, CartaoProposto, Fonte, Recurso, RegistroFeynman } from "./tipos";

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export class ErroIA extends Error {
  constructor(
    public codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

async function postar(caminho: string, corpo: unknown): Promise<Response> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  try {
    return await fetch(caminho, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new ErroIA("conexao", "Sem conexão com o servidor. Verifique a internet e tente de novo.");
  }
}

async function erroDaResposta(r: Response): Promise<ErroIA> {
  const json = await r.json().catch(() => null);
  if (r.status === 504) return new ErroIA("tempo", "O servidor demorou demais para responder. Tente de novo em instantes.");
  return new ErroIA(json?.erro?.codigo ?? "erro", json?.erro?.mensagem ?? `Erro ${r.status}. Tente de novo.`);
}

/** POST numa rota do servidor com o token da sessão. Erros chegam com mensagem pronta. */
export async function api<T>(caminho: string, corpo: unknown): Promise<T> {
  const r = await postar(caminho, corpo);
  if (!r.ok) throw await erroDaResposta(r);
  return (await r.json()) as T;
}

export type StatusIA = {
  configurada: boolean;
  custo_mes: number;
  teto_mensal: number;
  chamadas_hoje: number;
  limite_diario: number;
  alerta: "perto_do_teto" | "bloqueado" | null;
};

/** Se a chave existe no servidor (sem revelar o valor) e como está o gasto do mês. */
export async function statusIA(): Promise<StatusIA | null> {
  try {
    return await api<StatusIA>("/api/ia/status", {});
  } catch {
    return null;
  }
}

export async function iaConfigurada(): Promise<boolean> {
  return Boolean((await statusIA())?.configurada);
}

// --- Aulas ------------------------------------------------------------------

export type ProgressoAula = { etapa: "pendente" | "pesquisa" | "verificacao" | "composicao" | "conferencia"; reaproveitado?: boolean; caracteres?: number };

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Acompanha uma geração que roda em outra aba/requisição (sem chamar a IA). */
async function aguardarGeracao(geracaoId: string, aoProgresso: (p: ProgressoAula) => void): Promise<{ id: string }> {
  for (let i = 0; i < 140; i++) {
    const s = await api<{ status: string; aula_id: string | null; erro: { codigo: string; mensagem: string } | null; em_andamento: boolean }>("/api/ia/aula/status", { geracao_id: geracaoId });
    if (s.status === "concluida" && s.aula_id) return { id: s.aula_id };
    if (s.status === "erro" && !s.em_andamento) throw new ErroIA(s.erro?.codigo ?? "erro", s.erro?.mensagem ?? "A geração falhou. Tente de novo.");
    if (!s.em_andamento && s.status !== "erro") throw new ErroIA("interrompida", "A geração foi interrompida. Toque em Tentar de novo: o que já foi feito é aproveitado.");
    if (s.status !== "erro") aoProgresso({ etapa: s.status as ProgressoAula["etapa"] });
    await espera(3000);
  }
  throw new ErroIA("tempo", "A geração está demorando mais que o normal. Volte em alguns minutos.");
}

/**
 * Gera a aula lendo o progresso em tempo real (NDJSON). `geracaoId` é o id de
 * idempotência: o mesmo clique, recarga ou outra aba não dispara uma segunda geração.
 */
export async function gerarAula(
  p: { trimestreId: string; passo: "nucleo" | "paralela"; geracaoId: string; novasFontes?: boolean },
  aoProgresso: (p: ProgressoAula) => void = () => {},
): Promise<{ id: string }> {
  const r = await postar("/api/ia/aula", { geracao_id: p.geracaoId, trimestre_id: p.trimestreId, passo: p.passo, novas_fontes: p.novasFontes || undefined });
  if (!r.ok || !r.body) throw await erroDaResposta(r);
  const leitor = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let resto = "";
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      resto += value;
      const linhas = resto.split("\n");
      resto = linhas.pop() ?? "";
      for (const l of linhas) {
        if (!l.trim()) continue;
        const ev = JSON.parse(l) as { etapa?: string; reaproveitado?: boolean; caracteres?: number; id?: string; geracao_id?: string; erro?: { codigo: string; mensagem: string } };
        if (ev.erro) {
          if (ev.erro.codigo === "em_andamento") return aguardarGeracao(ev.geracao_id ?? p.geracaoId, aoProgresso);
          throw new ErroIA(ev.erro.codigo, ev.erro.mensagem);
        }
        if (ev.etapa === "pronto" && ev.id) return { id: ev.id };
        aoProgresso(ev as ProgressoAula);
      }
    }
  } catch (e) {
    if (e instanceof ErroIA) throw e;
    // conexão caiu no meio: a geração continua no servidor; acompanha pelo status
  }
  return aguardarGeracao(p.geracaoId, aoProgresso);
}

export async function explicarDeOutroJeito(aulaId: string, bloco: number) {
  return api<{ explicacao: string; analogia: string; reaproveitada: boolean }>("/api/ia/explicar", { aula_id: aulaId, bloco });
}

export async function carregarAula(id: string): Promise<Aula | null> {
  return ok(await supabase().from("aulas").select("*").eq("id", id).maybeSingle()) as Aula | null;
}

export async function listarAulas(limite = 100) {
  return ok(await supabase().from("aulas").select("id, passo, titulo, trimestre_id, tema_id, estudada_em, created_at").order("created_at", { ascending: false }).limit(limite)) as Omit<Aula, "conteudo" | "respostas" | "cartoes_resolvidos" | "usou_biblioteca">[];
}

export async function salvarProgressoAula(id: string, patch: Partial<Pick<Aula, "respostas" | "cartoes_resolvidos">>) {
  ok(await supabase().from("aulas").update(patch).eq("id", id));
}

/** Conclui a aula: marca como estudada e registra a sessão (conta na sequência e no checklist). */
export async function concluirAula(aula: Aula, pilarId: string | null) {
  const sb = supabase();
  const agora = new Date();
  if (!aula.estudada_em) {
    ok(await sb.from("aulas").update({ estudada_em: agora.toISOString() }).eq("id", aula.id));
    ok(await sb.from("sessoes_estudo").insert({ data: dataLocal(agora), pilar_id: pilarId, tema_id: aula.tema_id, minutos: 30, tipo: aula.passo }));
  }
}

export async function guardarCartoesPropostos(cartoes: CartaoProposto[], pilarId: string | null, temaId: string | null) {
  const novos: NovoCartao[] = cartoes.map((c) => ({
    frente: c.frente,
    verso: c.verso,
    tipo: c.tipo,
    pilar_id: pilarId,
    tema_id: temaId,
    tags: c.tags,
    fonte: c.fonte || null,
    origem: "ia",
  }));
  return criarCartoes(novos);
}

// --- Fontes -------------------------------------------------------------------

export async function listarFontes() {
  return ok(await supabase().from("fontes").select("*").order("created_at", { ascending: false }).limit(300)) as Fonte[];
}

export async function marcarConsumida(url: string, consumido: boolean) {
  ok(
    await supabase()
      .from("fontes")
      .update({ consumido, consumido_em: consumido ? new Date().toISOString() : null })
      .eq("url", url),
  );
}

// --- Tutor Feynman ---------------------------------------------------------------

export async function avaliarFeynman(temaId: string, explicacao: string) {
  return api<{ id: string; created_at: string; avaliacao: AvaliacaoFeynman }>("/api/ia/feynman", { tema_id: temaId, explicacao });
}

export async function historicoFeynman(temaId: string) {
  return ok(await supabase().from("feynman").select("*").eq("tema_id", temaId).order("created_at", { ascending: false }).limit(30)) as RegistroFeynman[];
}

// --- Biblioteca -------------------------------------------------------------------

export async function listarBiblioteca() {
  const sb = supabase();
  const [a, r] = await Promise.all([
    sb.from("biblioteca_arquivos").select("*").order("created_at", { ascending: false }),
    sb.from("recursos").select("id, titulo, autor, tipo, url, pilar_id, tema_id, status, anotacoes").order("created_at"),
  ]);
  return { arquivos: ok(a) as ArquivoBiblioteca[], recursos: ok(r) as Recurso[] };
}

export function formatoDoArquivo(nome: string, kindle: boolean): ArquivoBiblioteca["formato"] | null {
  const n = nome.toLowerCase();
  if (kindle || /clippings/.test(n)) return "kindle";
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".epub")) return "epub";
  if (n.endsWith(".txt") || n.endsWith(".md")) return "txt";
  return null;
}

/** Envia o arquivo direto para o Storage privado (pasta do usuário) e pede o processamento. */
export async function enviarArquivo(userId: string, arquivo: File, dados: { titulo: string; autor: string | null; recurso_id: string | null; kindle: boolean }) {
  const formato = formatoDoArquivo(arquivo.name, dados.kindle);
  if (!formato) throw new ErroIA("arquivo_invalido", "Formato não aceito. Envie PDF, EPUB, TXT ou o My Clippings.txt do Kindle.");
  if (arquivo.size > 50 * 1024 * 1024) throw new ErroIA("arquivo_invalido", "Arquivo maior que 50 MB.");
  const sb = supabase();
  const extensao = formato === "kindle" ? "txt" : formato;
  const caminho = `${userId}/${crypto.randomUUID()}.${extensao}`;
  const up = await sb.storage.from("biblioteca").upload(caminho, arquivo, { contentType: arquivo.type || "application/octet-stream", upsert: false });
  if (up.error) throw new ErroIA("upload", "Não consegui enviar o arquivo: " + up.error.message);
  const linha = ok(
    await sb
      .from("biblioteca_arquivos")
      .insert({ titulo: dados.titulo, autor: dados.autor, formato, caminho, tamanho_bytes: arquivo.size, recurso_id: dados.recurso_id, origem: "upload" })
      .select("id")
      .single(),
  ) as { id: string };
  await api("/api/biblioteca/processar", { arquivo_id: linha.id });
  return linha.id;
}

export async function reprocessarArquivo(id: string) {
  return api("/api/biblioteca/processar", { arquivo_id: id });
}

export async function excluirArquivo(a: ArquivoBiblioteca) {
  const sb = supabase();
  ok(await sb.from("biblioteca_arquivos").delete().eq("id", a.id));
  // Destaques do Kindle compartilham o mesmo arquivo: só apaga quando ninguém mais usa.
  const restantes = ok(await sb.from("biblioteca_arquivos").select("id").eq("caminho", a.caminho)) as { id: string }[];
  if (!restantes.length) await sb.storage.from("biblioteca").remove([a.caminho]);
}

export async function vincularRecurso(arquivoId: string, recursoId: string | null) {
  ok(await supabase().from("biblioteca_arquivos").update({ recurso_id: recursoId }).eq("id", arquivoId));
}

export async function buscarNaBiblioteca(consulta: string) {
  return ok(await supabase().rpc("buscar_trechos", { consulta, arquivos: null, limite: 20 })) as {
    id: string;
    arquivo_id: string;
    titulo: string;
    autor: string | null;
    capitulo: string | null;
    pagina: number | null;
    texto: string;
  }[];
}

export type FonteEncontrada = { id: string; url: string; titulo: string; tipo: string; categoria: string; acesso: string; gratuita: boolean; permiteDownload: boolean };

export async function buscarPdfLegal(consulta: string) {
  return api<{ fontes: FonteEncontrada[]; observacao: string }>("/api/biblioteca/buscar-pdf", { consulta });
}

export async function adicionarObraAberta(dados: { url: string; titulo: string; autor?: string | null; recurso_id?: string | null }) {
  return api<{ id: string }>("/api/biblioteca/importar", dados);
}

// --- Resumo de uso da IA -------------------------------------------------------------

export type PainelIA = {
  custo_mes: number;
  aulas_mes: number;
  custo_aulas_mes: number;
  geracoes_mes: number;
  geracoes_ok_mes: number;
  cache_tokens_mes: number;
  economia_cache_usd: number;
  economia_reuso_usd: number;
  reaproveitamentos_mes: number;
};

/** Painel do mês (migração 0003) e os últimos erros com o detalhe técnico. Null antes da migração. */
export async function painelIA(): Promise<{ painel: PainelIA; erros: { created_at: string; etapa: string | null; erro: string | null; erro_detalhe: { status: number | null; mensagem: string; request_id: string | null; modelo: string | null } | null }[] } | null> {
  const sb = supabase();
  const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [p, e] = await Promise.all([
    sb.rpc("painel_ia", { fuso }),
    sb.from("ia_chamadas").select("created_at, etapa, erro, erro_detalhe").eq("sucesso", false).order("created_at", { ascending: false }).limit(5),
  ]);
  if (p.error || e.error) return null;
  const linha = (p.data as Record<string, number | string>[])[0] ?? {};
  const painel = Object.fromEntries(Object.entries(linha).map(([k, v]) => [k, Number(v)])) as PainelIA;
  return { painel, erros: e.data ?? [] };
}

export async function resumoIA() {
  const sb = supabase();
  const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const [r, c] = await Promise.all([
    sb.rpc("resumo_ia", { fuso }),
    sb.from("ia_chamadas").select("funcao, custo_usd, input_tokens, output_tokens, buscas_web, sucesso").gte("created_at", inicioMes.toISOString()).limit(2000),
  ]);
  const resumo = (ok(r) as { chamadas_hoje: number; custo_mes: number; chamadas_mes: number; custo_hoje: number }[])[0];
  const chamadas = ok(c) as { funcao: string; custo_usd: number; input_tokens: number; output_tokens: number; buscas_web: number; sucesso: boolean }[];
  const porFuncao = new Map<string, { chamadas: number; custo: number; tokens: number }>();
  for (const x of chamadas) {
    const f = porFuncao.get(x.funcao) ?? { chamadas: 0, custo: 0, tokens: 0 };
    f.chamadas++;
    f.custo += Number(x.custo_usd);
    f.tokens += x.input_tokens + x.output_tokens;
    porFuncao.set(x.funcao, f);
  }
  return {
    chamadasHoje: Number(resumo?.chamadas_hoje ?? 0),
    custoMes: Number(resumo?.custo_mes ?? 0),
    chamadasMes: Number(resumo?.chamadas_mes ?? 0),
    custoHoje: Number(resumo?.custo_hoje ?? 0),
    porFuncao: [...porFuncao.entries()].map(([funcao, v]) => ({ funcao, ...v })),
  };
}
