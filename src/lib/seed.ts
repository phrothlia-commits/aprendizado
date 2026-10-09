/**
 * Monta o payload da carga inicial a partir dos arquivos JSON de /seeds.
 * Pura e determinística (exceto pelos UUIDs), para ser testada sem banco.
 */
import pilaresSeed from "../../seeds/pilares.json";
import recursosSeed from "../../seeds/recursos.json";
import cicloSeed from "../../seeds/ciclo.json";
import idiomasSeed from "../../seeds/idiomas.json";
import cf88Seed from "../../seeds/cartoes-cf88.json";
import inglesSeed from "../../seeds/cartoes-ingles.json";

export type PayloadSeed = ReturnType<typeof montarSeed>;

type GeradorId = () => string;

export function montarSeed(gerarId: GeradorId = () => crypto.randomUUID()) {
  const pilares = pilaresSeed.map((p) => ({
    id: gerarId(),
    numero: p.numero,
    slug: p.slug,
    nome: p.nome,
    prioridade: p.prioridade,
    cor: p.cor,
    descricao: p.descricao,
  }));
  const pilarPorSlug = new Map(pilares.map((p) => [p.slug, p]));
  const pilarPorNumero = new Map(pilares.map((p) => [p.numero, p]));

  const temas = pilaresSeed.flatMap((p) =>
    p.temas.map((t) => ({
      id: gerarId(),
      pilar_id: pilarPorSlug.get(p.slug)!.id,
      slug: t.slug,
      nome: t.nome,
      nivel: "fundamentos",
      status: "fila",
    })),
  );
  const temaPorSlug = new Map(temas.map((t) => [t.slug, t]));
  const tema = (slug: string) => {
    const t = temaPorSlug.get(slug);
    if (!t) throw new Error(`Seed: tema inexistente "${slug}"`);
    return t;
  };

  const recursos = recursosSeed.map((r) => {
    const t = tema(r.tema);
    return {
      titulo: r.titulo,
      autor: r.autor ?? null,
      tipo: r.tipo,
      url: "url" in r ? (r.url ?? null) : null,
      pilar_id: t.pilar_id,
      tema_id: t.id,
      anotacoes: "anotacoes" in r ? (r.anotacoes ?? null) : null,
    };
  });

  const ciclo = {
    id: gerarId(),
    numero: cicloSeed.numero,
    nivel: cicloSeed.nivel,
    data_inicio: cicloSeed.data_inicio,
    data_fim: cicloSeed.data_fim,
  };

  const trimestres = cicloSeed.trimestres.map((t) => ({
    ciclo_id: ciclo.id,
    ordem: t.ordem,
    periodo: t.periodo,
    data_inicio: t.data_inicio,
    data_fim: t.data_fim,
    nucleo_titulo: t.nucleo.titulo,
    tema_nucleo_id: tema(t.nucleo.tema).id,
    paralela_titulo: t.paralela.titulo,
    tema_paralelo_id: tema(t.paralela.tema).id,
    idiomas_foco: t.idiomas_foco,
  }));

  // Os temas do primeiro trimestre começam ativos, assim como o inglês e
  // Provérbios e Salmos (trilha diária).
  const ativos = new Set([cicloSeed.trimestres[0].nucleo.tema, cicloSeed.trimestres[0].paralela.tema, "ingles", "proverbios-e-salmos"]);
  for (const t of temas) if (ativos.has(t.slug)) t.status = "ativo";

  const idiomas = idiomasSeed.map((i) => ({
    nome: i.nome,
    nivel_atual: i.nivel_atual,
    meta: i.meta,
    ambicao: i.ambicao,
    motivo: i.motivo,
    marcos: i.marcos,
    status: i.status,
  }));

  const cf88 = tema(cf88Seed.tema);
  const cartoesCf88 = cf88Seed.cartoes.map((c) => ({
    frente: c.frente,
    verso: c.verso,
    tipo: "basico",
    pilar_id: cf88.pilar_id,
    tema_id: cf88.id,
    tags: c.tags,
    fonte: cf88Seed.fonte,
  }));

  const ingles = tema("ingles");
  const cartoesIngles = inglesSeed.palavras.map(([palavra, frase, traducao, frasePt]) => ({
    frente: `${palavra}\n\n${frase}`,
    verso: `${traducao}\n\n${frasePt}`,
    tipo: "idioma",
    pilar_id: ingles.pilar_id,
    tema_id: ingles.id,
    tags: ["ingles", "ngsl"],
    fonte: "NGSL (ordem aproximada)",
  }));

  // Intercala os novos para que os primeiros dias já misturem pilares.
  const cartoes = intercalar([cartoesCf88, cartoesIngles]);

  if (!pilarPorNumero.has(4) || !pilarPorNumero.has(8)) throw new Error("Seed: pilares 4 e 8 são obrigatórios");

  return { pilares, temas, recursos, ciclos: [ciclo], trimestres, idiomas, cartoes };
}

export function intercalar<T>(listas: T[][]): T[] {
  const saida: T[] = [];
  const max = Math.max(0, ...listas.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const l of listas) if (i < l.length) saida.push(l[i]);
  return saida;
}
