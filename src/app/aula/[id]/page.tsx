"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppShell";
import { IconeCheck, IconeExterno, IconeFechar, IconeLampada, IconeOlhoFechado, IconeSeta, IconeTipoFonte } from "@/components/icones";
import { Aviso, CaixaErro, Esqueleto, Etapas, Folha, Rodape, TopoFluxo } from "@/components/ui";
import { adicionarObraAberta, carregarAula, concluirAula, explicarDeOutroJeito, guardarCartoesPropostos, marcarConsumida, salvarProgressoAula } from "@/lib/ia";
import type { Aula, CartaoProposto, RefNumerada } from "@/lib/tipos";

type Etapa = { tipo: "objetivo" } | { tipo: "leitura"; b: number } | { tipo: "pergunta"; b: number; q: number } | { tipo: "fixar" };

const TIPO_ROTULO: Record<string, string> = { texto: "Texto", video: "Vídeo", audio: "Áudio", curso: "Curso", lei: "Lei" };

export default function AulaPagina() {
  const { id } = useParams<{ id: string }>();
  const [aula, setAula] = useState<Aula | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    carregarAula(id).then((a) => (a ? setAula(a) : setErro("Aula não encontrada.")), (e) => setErro(e.message));
  }, [id]);

  if (erro) return <div className="p-5"><CaixaErro mensagem={erro} acao={<Link href="/" className="botao-secundario">Voltar para Hoje</Link>} /></div>;
  if (!aula) return <div className="p-5"><Esqueleto /></div>;
  return <Fluxo aula={aula} />;
}

function Fluxo({ aula }: { aula: Aula }) {
  const c = aula.conteudo;
  const etapas = useMemo<Etapa[]>(
    () => [
      { tipo: "objetivo" },
      ...c.blocos.flatMap((b, i) => [{ tipo: "leitura" as const, b: i }, ...b.perguntas.map((_, q) => ({ tipo: "pergunta" as const, b: i, q }))]),
      { tipo: "fixar" },
    ],
    [c.blocos],
  );
  const [indice, setIndice] = useState(() => Math.min(aula.respostas?.passo ?? 0, etapas.length - 1));
  const [respostas, setRespostas] = useState(aula.respostas ?? {});

  const ir = useCallback(
    (novo: number, extra: Partial<Aula["respostas"]> = {}) => {
      const r = { ...respostas, ...extra, passo: Math.max(novo, respostas.passo ?? 0) };
      setRespostas(r);
      setIndice(novo);
      window.scrollTo({ top: 0 });
      salvarProgressoAula(aula.id, { respostas: r }).catch(() => {});
    },
    [aula.id, respostas],
  );

  const e = etapas[indice];
  const leituras = etapas.filter((x) => x.tipo !== "objetivo" && x.tipo !== "fixar").length;
  const feitasLeitura = etapas.slice(0, indice).filter((x) => x.tipo !== "objetivo").length;
  const etapaBarra: 0 | 1 | 2 = e.tipo === "objetivo" ? 0 : e.tipo === "fixar" ? 2 : 1;
  const fracao = e.tipo === "objetivo" ? 1 : e.tipo === "fixar" ? 1 : feitasLeitura / Math.max(1, leituras);
  const tituloTopo =
    e.tipo === "objetivo" ? c.titulo : e.tipo === "leitura" ? `Bloco ${e.b + 1} de ${c.blocos.length}` : e.tipo === "pergunta" ? `Pergunta do bloco ${e.b + 1}` : aula.estudada_em ? "Aula concluída" : "Fixar";

  return (
    <div className="flex min-h-dvh flex-col">
      <TopoFluxo href="/" titulo={tituloTopo} rotuloFechar="Fechar aula">
        <Etapas atual={etapaBarra} fracao={fracao} />
      </TopoFluxo>
      {e.tipo === "objetivo" && <Objetivo aula={aula} respostas={respostas.pre ?? []} acertos={respostas.pre_ok ?? []} aoAvancar={(pre, pre_ok) => ir(1, { pre, pre_ok })} />}
      {e.tipo === "leitura" && <Leitura key={e.b} aula={aula} b={e.b} aoAvancar={() => ir(indice + 1)} />}
      {e.tipo === "pergunta" && (
        <Pergunta
          key={`${e.b}-${e.q}`}
          aula={aula}
          b={e.b}
          q={e.q}
          inicial={respostas.rec?.[`${e.b}-${e.q}`] ?? ""}
          aoAvancar={(texto) => ir(indice + 1, { rec: { ...(respostas.rec ?? {}), [`${e.b}-${e.q}`]: texto } })}
        />
      )}
      {e.tipo === "fixar" && <Fixar aula={aula} />}
    </div>
  );
}

// --- 1. Objetivo e pré-teste ------------------------------------------------------

function Objetivo({
  aula,
  respostas,
  acertos: acertosIniciais,
  aoAvancar,
}: {
  aula: Aula;
  respostas: string[];
  acertos: (boolean | null)[];
  aoAvancar: (pre: string[], preOk: (boolean | null)[]) => void;
}) {
  const c = aula.conteudo;
  const [palpites, setPalpites] = useState<string[]>(() => c.pre_teste.map((_, i) => respostas[i] ?? ""));
  // Autoavaliação: alimenta o perfil do aluno (sem IA) nas próximas aulas.
  const [acertos, setAcertos] = useState<(boolean | null)[]>(() => c.pre_teste.map((_, i) => acertosIniciais[i] ?? null));
  const [revelado, setRevelado] = useState(respostas.length > 0);
  const respondeu = palpites.every((p) => p.trim());
  return (
    <>
      <main className="flex flex-1 flex-col gap-6 px-5 pt-6">
        <section>
          <div className="rotulo">Ao final desta aula</div>
          <p className="mt-2.5 font-serif text-[25px] leading-[1.25] tracking-[-0.01em]">{c.objetivo}</p>
        </section>
        {c.avisos.map((a) => (
          <Aviso key={a}>{a}</Aviso>
        ))}
        {c.pre_teste.length > 0 && (
          <section aria-labelledby="pre" className="cartao-ui flex flex-col gap-3.5">
            <div>
              <div id="pre" className="rotulo">
                Antes de começar
              </div>
              <p className="mt-1.5 text-[13px] leading-snug text-texto-2">Chute sem medo. Errar agora ajuda a lembrar depois.</p>
            </div>
            {c.pre_teste.map((p, i) => (
              <div key={i} className="flex flex-col gap-2">
                <label htmlFor={`pre-${i}`} className="text-[17px] leading-snug font-semibold">
                  {p.pergunta}
                </label>
                <textarea
                  id={`pre-${i}`}
                  rows={2}
                  className="campo text-[15px]"
                  placeholder="Seu palpite"
                  value={palpites[i]}
                  readOnly={revelado}
                  onChange={(ev) => setPalpites((x) => x.map((v, k) => (k === i ? ev.target.value : v)))}
                />
                {revelado && (
                  <div className="flex flex-col gap-2 rounded-xl bg-superficie-2 px-3.5 py-3 text-sm leading-relaxed">
                    <div>
                      <span className="font-semibold">Gabarito:</span> {p.resposta}
                    </div>
                    <div className="flex gap-2" role="group" aria-label="Você acertou?">
                      {([true, false] as const).map((v) => (
                        <button
                          key={String(v)}
                          type="button"
                          aria-pressed={acertos[i] === v}
                          onClick={() => setAcertos((x) => x.map((a, k) => (k === i ? v : a)))}
                          className={`h-8 cursor-pointer rounded-full px-3 text-xs font-semibold ${acertos[i] === v ? "bg-texto text-fundo" : "bg-superficie"}`}
                        >
                          {v ? "Acertei" : "Errei"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!revelado && (
              <button type="button" className="botao-leve" disabled={!respondeu} onClick={() => setRevelado(true)}>
                {respondeu ? "Ver gabarito" : "Responda para ver o gabarito"}
              </button>
            )}
          </section>
        )}
      </main>
      <Rodape>
        <button type="button" className="botao-primario h-[52px]" disabled={c.pre_teste.length > 0 && !revelado} onClick={() => aoAvancar(palpites, acertos)}>
          Começar a aula
          <IconeSeta />
        </button>
        <div className="text-center text-xs text-texto-2">
          {c.blocos.length} blocos curtos · cerca de {Math.max(15, c.blocos.length * 6)} min
        </div>
      </Rodape>
    </>
  );
}

// --- 2. Leitura com fontes numeradas ------------------------------------------------

function Leitura({ aula, b, aoAvancar }: { aula: Aula; b: number; aoAvancar: () => void }) {
  const bloco = aula.conteudo.blocos[b];
  const [ref, setRef] = useState<RefNumerada | null>(null);
  const [alternativa, setAlternativa] = useState(bloco.alternativa ?? null);
  const [mostrar, setMostrar] = useState(false);
  const [pedindo, setPedindo] = useState(false);
  const [erroAlt, setErroAlt] = useState<string | null>(null);

  async function outroJeito() {
    if (alternativa) return setMostrar((m) => !m);
    setPedindo(true);
    setErroAlt(null);
    try {
      const r = await explicarDeOutroJeito(aula.id, b);
      const alt = { explicacao: r.explicacao, analogia: r.analogia };
      // Guardada no servidor: pedir de novo devolve a mesma, sem chamar a API.
      setAlternativa(alt);
      setMostrar(true);
    } catch (e) {
      setErroAlt((e as Error).message);
    } finally {
      setPedindo(false);
    }
  }
  const porN = new Map(aula.conteudo.referencias.map((r) => [r.n, r]));
  return (
    <>
      <main className="flex flex-1 flex-col gap-[18px] px-6 pt-[26px]">
        <h1 className="font-serif text-[30px] leading-[1.12] font-medium tracking-[-0.015em]">{bloco.titulo}</h1>
        {bloco.paragrafos.map((p, i) => (
          <p key={i} className="font-serif text-[19px] leading-[1.55]">
            {renderizarNegrito(p.texto)}
            {p.refs.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRef(porN.get(n) ?? null)}
                aria-label={`Ver fonte ${n}`}
                className="ml-1 inline-flex h-5 min-w-[22px] cursor-pointer items-center justify-center rounded-md bg-superficie-2 px-1.5 align-[2px] font-sans text-[11px] font-bold"
              >
                {n}
              </button>
            ))}
          </p>
        ))}
        {bloco.analogia && (
          <aside className="flex gap-3 rounded-2xl border border-borda bg-superficie px-[18px] py-4">
            <IconeLampada className="mt-0.5 flex-none" />
            <p className="text-[15px] leading-normal">{bloco.analogia}</p>
          </aside>
        )}
        <button type="button" className="botao-leve self-start" onClick={outroJeito} disabled={pedindo} aria-expanded={mostrar}>
          {pedindo ? "Explicando de outro jeito…" : alternativa && mostrar ? "Esconder a outra explicação" : "Explicar de outro jeito"}
        </button>
        {erroAlt && <Aviso>{erroAlt}</Aviso>}
        {alternativa && mostrar && (
          <section aria-label="Outra explicação" className="flex flex-col gap-3 rounded-2xl bg-superficie-2 px-[18px] py-4">
            <div className="rotulo">De outro jeito</div>
            {alternativa.explicacao.split(/\n\s*\n/).map((t, i) => (
              <p key={i} className="text-[16px] leading-relaxed">
                {renderizarNegrito(t)}
              </p>
            ))}
            {alternativa.analogia && (
              <p className="flex gap-3 text-[15px] leading-normal">
                <IconeLampada className="mt-0.5 flex-none" />
                {alternativa.analogia}
              </p>
            )}
          </section>
        )}
      </main>
      <Rodape>
        <button type="button" className="botao-primario h-[52px]" onClick={aoAvancar}>
          Continuar
          <IconeSeta />
        </button>
      </Rodape>
      <Folha aberta={!!ref} aoFechar={() => setRef(null)} rotulo="Fonte">
        {ref && <DetalheFonte refn={ref} />}
      </Folha>
    </>
  );
}

function DetalheFonte({ refn }: { refn: RefNumerada }) {
  const origem = refn.origem === "biblioteca" ? "Sua biblioteca" : refn.origem === "busca" ? "Fonte verificada" : "Obra de referência";
  return (
    <>
      <div className="rotulo">
        Fonte {refn.n} · {origem}
      </div>
      <div>
        <div className="font-serif text-[22px] leading-tight font-medium">{refn.titulo ?? refn.citacao}</div>
        {refn.titulo && <div className="mt-1 text-sm text-texto-2">{refn.citacao}</div>}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-texto-2">{refn.acesso ?? (refn.origem === "obra" ? "Citação de obra, sem link" : "")}</span>
        {refn.url ? (
          <a href={refn.url} target="_blank" rel="noreferrer" className="botao h-11 bg-texto px-4 text-sm text-fundo">
            Abrir <IconeExterno />
          </a>
        ) : refn.origem === "biblioteca" ? (
          <Link href="/biblioteca" className="botao h-11 bg-texto px-4 text-sm text-fundo">
            Abrir
          </Link>
        ) : null}
      </div>
    </>
  );
}

function renderizarNegrito(texto: string) {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) => (parte.startsWith("**") && parte.endsWith("**") ? <strong key={i}>{parte.slice(2, -2)}</strong> : <span key={i}>{parte}</span>));
}

// --- 3. Pergunta de recuperação ---------------------------------------------------------

function Pergunta({ aula, b, q, inicial, aoAvancar }: { aula: Aula; b: number; q: number; inicial: string; aoAvancar: (texto: string) => void }) {
  const { temas } = useApp();
  const bloco = aula.conteudo.blocos[b];
  const pergunta = bloco.perguntas[q];
  const [texto, setTexto] = useState(inicial);
  const [revelado, setRevelado] = useState(!!inicial);
  const [salvando, setSalvando] = useState(false);
  const primeiraRef = aula.conteudo.referencias.find((r) => bloco.paragrafos.some((p) => p.refs.includes(r.n)));

  async function revisarDepois() {
    setSalvando(true);
    const pilar = temas.find((t) => t.id === aula.tema_id)?.pilar_id ?? null;
    await guardarCartoesPropostos([{ frente: pergunta.pergunta, verso: pergunta.resposta, tipo: "por_que", tags: ["aula"], fonte: primeiraRef?.citacao ?? aula.conteudo.titulo }], pilar, aula.tema_id).catch(() => {});
    aoAvancar(texto);
  }

  return (
    <>
      <main className="flex flex-1 flex-col gap-5 px-5 pt-6">
        <span className="chip self-start">
          <IconeOlhoFechado />
          Sem consultar o texto
        </span>
        <h1 className="font-serif text-[26px] leading-[1.2] font-medium tracking-[-0.01em]">{pergunta.pergunta}</h1>
        <div className="flex flex-col gap-2">
          <label htmlFor="resp" className="rotulo">
            Sua resposta
          </label>
          <textarea id="resp" rows={4} className="campo text-[16px] leading-relaxed" value={texto} readOnly={revelado} onChange={(ev) => setTexto(ev.target.value)} placeholder="Escreva com suas palavras" />
        </div>
        {revelado && (
          <section aria-label="Resposta de referência" className="flex flex-col gap-2 rounded-2xl border border-borda bg-superficie p-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-ok">
              <IconeCheck />
              Resposta de referência
            </div>
            <p className="text-[15px] leading-relaxed">{pergunta.resposta}</p>
            {primeiraRef && <div className="text-xs text-texto-2">Fonte: {primeiraRef.citacao}</div>}
          </section>
        )}
      </main>
      <Rodape>
        {!revelado ? (
          <button type="button" className="botao-primario h-[52px]" disabled={!texto.trim()} onClick={() => setRevelado(true)}>
            Comparar com a resposta
          </button>
        ) : (
          <div className="flex gap-2.5">
            <button type="button" className="botao-secundario h-[52px] flex-1 text-sm" disabled={salvando} onClick={revisarDepois}>
              Errei, revisar depois
            </button>
            <button type="button" className="botao-primario h-[52px] flex-1" onClick={() => aoAvancar(texto)}>
              Continuar
              <IconeSeta />
            </button>
          </div>
        )}
      </Rodape>
    </>
  );
}

// --- 4. Fixar e ir além ------------------------------------------------------------------

function Fixar({ aula }: { aula: Aula }) {
  const { temas } = useApp();
  const router = useRouter();
  const c = aula.conteudo;
  const resolvidos = new Map(aula.cartoes_resolvidos.map((r) => [r.i, r.status]));
  const [cartoes, setCartoes] = useState<(CartaoProposto & { status: "aprovado" | "descartado" })[]>(() =>
    c.cartoes.map((x, i) => ({ ...x, status: resolvidos.get(i) ?? "aprovado" })),
  );
  const [editando, setEditando] = useState<number | null>(null);
  const [consumidas, setConsumidas] = useState<Record<string, boolean>>({});
  const [adicionadas, setAdicionadas] = useState<Record<string, "ok" | "erro" | "enviando">>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const concluida = !!aula.estudada_em;
  const aprovados = cartoes.filter((x) => x.status === "aprovado");
  const pilarId = temas.find((t) => t.id === aula.tema_id)?.pilar_id ?? null;
  const biblioteca = c.referencias.filter((r) => r.origem === "biblioteca");

  async function concluir(destino: string) {
    setSalvando(true);
    setErro(null);
    try {
      if (!concluida && aprovados.length) await guardarCartoesPropostos(aprovados, pilarId, aula.tema_id);
      await salvarProgressoAula(aula.id, { cartoes_resolvidos: cartoes.map((x, i) => ({ i, status: x.status })) });
      await concluirAula(aula, pilarId);
      router.push(destino);
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  async function adicionar(url: string, titulo: string, autor: string | null) {
    setAdicionadas((x) => ({ ...x, [url]: "enviando" }));
    try {
      await adicionarObraAberta({ url, titulo, autor });
      setAdicionadas((x) => ({ ...x, [url]: "ok" }));
    } catch (e) {
      setAdicionadas((x) => ({ ...x, [url]: "erro" }));
      setErro((e as Error).message);
    }
  }

  return (
    <>
      <main className="flex flex-1 flex-col gap-7 px-5 pt-6">
        <section aria-labelledby="cartoes" className="flex flex-col gap-3">
          <div>
            <h1 id="cartoes" className="titulo-cartao">
              Guarde na memória
            </h1>
            <p className="mt-1.5 text-[15px] text-texto-2">{concluida ? "Cartões desta aula." : "Aprove os cartões que fazem sentido para você. Toque no texto para editar."}</p>
          </div>
          {cartoes.map((x, i) => (
            <div key={i} className={`flex items-start gap-2.5 rounded-2xl border border-borda bg-superficie p-3.5 ${x.status === "descartado" ? "opacity-45" : ""}`}>
              {editando === i && !concluida ? (
                <div className="flex flex-1 flex-col gap-2">
                  <textarea aria-label="Frente" className="campo text-[15px]" rows={2} value={x.frente} onChange={(ev) => setCartoes((l) => l.map((y, k) => (k === i ? { ...y, frente: ev.target.value } : y)))} />
                  <textarea aria-label="Verso" className="campo text-[15px]" rows={2} value={x.verso} onChange={(ev) => setCartoes((l) => l.map((y, k) => (k === i ? { ...y, verso: ev.target.value } : y)))} />
                  <button type="button" className="botao-leve self-start text-sm" onClick={() => setEditando(null)}>
                    Pronto
                  </button>
                </div>
              ) : (
                <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => !concluida && setEditando(i)} disabled={concluida}>
                  <div className="text-[15px] leading-snug font-semibold">{x.frente}</div>
                  <div className="mt-1 text-sm leading-snug text-texto-2">{x.verso}</div>
                </button>
              )}
              {!concluida && editando !== i && (
                <>
                  <button
                    type="button"
                    aria-label="Descartar cartão"
                    aria-pressed={x.status === "descartado"}
                    onClick={() => setCartoes((l) => l.map((y, k) => (k === i ? { ...y, status: "descartado" } : y)))}
                    className="flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-xl border border-borda text-texto-2"
                  >
                    <IconeFechar tamanho={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Aprovar cartão"
                    aria-pressed={x.status === "aprovado"}
                    onClick={() => setCartoes((l) => l.map((y, k) => (k === i ? { ...y, status: "aprovado" } : y)))}
                    className={`flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-xl ${x.status === "aprovado" ? "bg-ok text-white" : "border border-borda text-texto-2"}`}
                  >
                    <IconeCheck tamanho={18} />
                  </button>
                </>
              )}
            </div>
          ))}
        </section>

        <section aria-labelledby="alem" className="flex flex-col gap-2.5">
          <h2 id="alem" className="rotulo">
            Para ir além
          </h2>
          {biblioteca.map((r) => (
            <Link key={r.n} href="/biblioteca" className="flex items-center gap-3 rounded-2xl border border-borda bg-superficie p-3.5">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-superficie-2">
                <IconeTipoFonte tipo="livro" tamanho={18} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">{r.titulo}</span>
                <span className="block text-[13px] text-texto-2">Livro · na sua biblioteca</span>
              </span>
            </Link>
          ))}
          {c.para_ir_alem.map((f) => (
            <div key={f.url} className="flex flex-col gap-2.5 rounded-2xl border border-borda bg-superficie p-3.5">
              <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-3">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-superficie-2">
                  <IconeTipoFonte tipo={f.tipo} tamanho={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug font-semibold">{f.titulo}</span>
                  <span className="block text-[13px] text-texto-2">
                    {[TIPO_ROTULO[f.tipo] ?? "Texto", f.autor, f.acesso].filter(Boolean).join(" · ")}
                    {f.gratuita ? " · gratuita" : ""}
                  </span>
                  {f.por_que && <span className="mt-1 block text-[13px] leading-snug">{f.por_que}</span>}
                </span>
                <IconeExterno className="flex-none text-texto-3" />
              </a>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={!!consumidas[f.url]}
                  onClick={() => {
                    const v = !consumidas[f.url];
                    setConsumidas((x) => ({ ...x, [f.url]: v }));
                    marcarConsumida(f.url, v).catch(() => {});
                  }}
                  className={`botao h-9 rounded-full px-3 text-[13px] ${consumidas[f.url] ? "bg-texto text-fundo" : "bg-superficie-2"}`}
                >
                  {consumidas[f.url] ? <IconeCheck /> : null}
                  Consumido
                </button>
                {f.permiteDownload && (
                  <button type="button" disabled={!!adicionadas[f.url]} onClick={() => adicionar(f.url, f.titulo, f.autor)} className="botao h-9 rounded-full bg-superficie-2 px-3 text-[13px]">
                    {adicionadas[f.url] === "ok" ? "Na biblioteca ✓" : adicionadas[f.url] === "enviando" ? "Adicionando…" : "Adicionar à biblioteca"}
                  </button>
                )}
              </div>
            </div>
          ))}
          {!biblioteca.length && !c.para_ir_alem.length && <p className="text-sm text-texto-2">A busca não encontrou fontes externas verificáveis para esta aula.</p>}
        </section>
        {erro && <CaixaErro mensagem={erro} />}
      </main>
      <Rodape>
        {concluida ? (
          <Link href="/" className="botao-primario h-[52px]">
            Voltar para Hoje
          </Link>
        ) : (
          <button type="button" className="botao-primario h-[52px]" disabled={salvando} onClick={() => concluir("/")}>
            {aprovados.length ? `Guardar ${aprovados.length} ${aprovados.length === 1 ? "cartão" : "cartões"} e concluir` : "Concluir aula"}
          </button>
        )}
        {aula.tema_id && (
          <button type="button" className="botao-secundario h-[52px]" disabled={salvando} onClick={() => (concluida ? router.push(`/feynman/${aula.tema_id}`) : concluir(`/feynman/${aula.tema_id}`))}>
            Explicar com minhas palavras
          </button>
        )}
      </Rodape>
    </>
  );
}
