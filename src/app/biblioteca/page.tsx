"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/AppShell";
import { IconeBusca, IconeCheck, IconeEnviar, IconeExterno, IconeLixo, IconeMais, IconeTipoFonte } from "@/components/icones";
import { Aviso, Cabecalho, CaixaErro, corPilar, Esqueleto, Folha, Ponto, Secao } from "@/components/ui";
import { dataLocal } from "@/lib/datas";
import { trimestreAtual } from "@/lib/hoje";
import {
  adicionarObraAberta,
  buscarNaBiblioteca,
  buscarPdfLegal,
  enviarArquivo,
  excluirArquivo,
  listarBiblioteca,
  listarFontes,
  marcarConsumida,
  reprocessarArquivo,
  vincularRecurso,
  type FonteEncontrada,
} from "@/lib/ia";
import { supabase } from "@/lib/supabase";
import type { ArquivoBiblioteca, Fonte, Recurso, Trimestre } from "@/lib/tipos";

type Filtro = "tudo" | "livros" | "leis" | "midia";
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "tudo", rotulo: "Tudo" },
  { id: "livros", rotulo: "Livros" },
  { id: "leis", rotulo: "Leis" },
  { id: "midia", rotulo: "Áudio e vídeo" },
];

function passaFiltro(f: Filtro, tipo: string) {
  if (f === "tudo") return true;
  if (f === "livros") return ["livro", "texto", "pdf", "epub", "txt", "kindle", "html", "curso"].includes(tipo);
  if (f === "leis") return tipo === "lei";
  return ["video", "audio", "podcast"].includes(tipo);
}

const FORMATO_ROTULO: Record<string, string> = { pdf: "PDF", epub: "EPUB", txt: "Texto", kindle: "Destaques do Kindle", html: "Página oficial" };

export default function Biblioteca() {
  const { pilares, temas, userId } = useApp();
  const [dados, setDados] = useState<{ arquivos: ArquivoBiblioteca[]; recursos: Recurso[]; fontes: Fonte[]; trimestre: Trimestre | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [envio, setEnvio] = useState<File | null>(null);
  const [buscaPdf, setBuscaPdf] = useState<{ consulta: string; recursoId: string | null } | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const buscar = useCallback(async () => {
    const [b, fontes, t] = await Promise.all([listarBiblioteca(), listarFontes().catch(() => []), supabase().from("trimestres").select("*").order("data_inicio")]);
    return { ...b, fontes, trimestre: trimestreAtual((t.data ?? []) as Trimestre[], dataLocal()).atual };
  }, []);
  const carregar = useCallback(() => {
    buscar().then(setDados, (e) => setErro((e as Error).message));
  }, [buscar]);
  useEffect(carregar, [carregar]);

  // Enquanto algum arquivo processa, atualiza a cada 4 s.
  useEffect(() => {
    if (!dados?.arquivos.some((a) => a.status === "processando")) return;
    const t = setTimeout(carregar, 4000);
    return () => clearTimeout(t);
  }, [dados, carregar]);

  const recursoPorId = useMemo(() => new Map((dados?.recursos ?? []).map((r) => [r.id, r])), [dados]);

  if (erro) return <CaixaErro mensagem={erro} />;
  if (!dados) return <Esqueleto />;

  const temasTrimestre = [dados.trimestre?.tema_nucleo_id, dados.trimestre?.tema_paralelo_id].filter(Boolean);
  const recursosTrimestre = dados.recursos.filter((r) => r.tema_id && temasTrimestre.includes(r.tema_id) && passaFiltro(filtro, r.tipo));
  const arquivoDoRecurso = (id: string) => dados.arquivos.find((a) => a.recurso_id === id && a.status === "pronto");
  const arquivos = dados.arquivos.filter((a) => passaFiltro(filtro, a.formato));
  const fontesAbertas = dados.fontes.filter((f) => f.permite_download && passaFiltro(filtro, f.tipo));
  const outrasFontes = dados.fontes.filter((f) => !f.permite_download && passaFiltro(filtro, f.tipo));
  const pilarDoRecurso = (r: Recurso) => pilares.find((p) => p.id === r.pilar_id);

  return (
    <div className="flex flex-col gap-6">
      <Cabecalho
        sobre="Seus livros, leis, artigos e aulas"
        titulo="Biblioteca"
        acao={
          <button type="button" className="botao h-11 rounded-xl bg-texto px-4 text-sm text-fundo" onClick={() => arquivoRef.current?.click()}>
            <IconeEnviar />
            Enviar
          </button>
        }
      />
      <input
        ref={arquivoRef}
        type="file"
        accept=".pdf,.epub,.txt,application/pdf,application/epub+zip,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setEnvio(f);
          e.target.value = "";
        }}
      />

      <div role="tablist" aria-label="Filtrar" className="flex gap-2 overflow-x-auto">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filtro === f.id}
            onClick={() => setFiltro(f.id)}
            className={`h-9 flex-none cursor-pointer rounded-full px-3.5 text-sm font-semibold ${filtro === f.id ? "bg-texto text-fundo" : "bg-superficie-2"}`}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      <BuscaTrechos />

      {recursosTrimestre.length > 0 && (
        <Secao titulo="Deste trimestre">
          <div className="cartao-ui flex flex-col gap-0 p-0">
            {recursosTrimestre.map((r) => {
              const arq = arquivoDoRecurso(r.id);
              return (
                <div key={r.id} className="flex items-center gap-3 border-b border-borda px-4 py-3 last:border-b-0">
                  <Ponto cor={corPilar(pilarDoRecurso(r)?.numero)} tamanho={8} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug font-semibold">{r.titulo}</span>
                    <span className="block text-[13px] text-texto-2">
                      {r.autor ? `${r.autor} · ` : ""}
                      {arq ? `${FORMATO_ROTULO[arq.formato]} · ${arq.total_trechos} trechos` : r.url ? "link oficial" : "você ainda não tem"}
                    </span>
                  </span>
                  {arq ? (
                    <IconeCheck className="text-ok" />
                  ) : r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer" className="botao h-9 rounded-full bg-superficie-2 px-3 text-[13px]">
                      Abrir <IconeExterno />
                    </a>
                  ) : (
                    <div className="flex gap-1.5">
                      <a href={`https://books.google.com/books?q=${encodeURIComponent([r.titulo, r.autor].filter(Boolean).join(" "))}`} target="_blank" rel="noreferrer" className="botao h-9 rounded-full bg-superficie-2 px-3 text-[13px]">
                        Prévia
                      </a>
                      <button type="button" className="botao h-9 rounded-full bg-superficie-2 px-3 text-[13px]" onClick={() => setBuscaPdf({ consulta: [r.titulo, r.autor].filter(Boolean).join(", "), recursoId: r.id })}>
                        PDF legal
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Secao>
      )}

      <Secao
        titulo="Seus arquivos"
        acao={
          <button type="button" className="text-[13px] font-semibold text-texto-2 underline-offset-2 hover:underline" onClick={() => setBuscaPdf({ consulta: "", recursoId: null })}>
            Buscar PDF legal
          </button>
        }
      >
        {arquivos.length === 0 ? (
          <p className="px-1 text-sm leading-relaxed text-texto-2">Nenhum arquivo ainda. Envie PDF, EPUB ou seus destaques do Kindle de obras que você possui, ou adicione obras de domínio público.</p>
        ) : (
          <div className="cartao-ui flex flex-col gap-0 p-0">
            {arquivos.map((a) => (
              <LinhaArquivo
                key={a.id}
                a={a}
                recursos={dados.recursos}
                recurso={a.recurso_id ? recursoPorId.get(a.recurso_id) : undefined}
                aoMudar={carregar}
                temaDe={(id) => temas.find((t) => t.id === id)?.nome}
              />
            ))}
          </div>
        )}
      </Secao>

      {fontesAbertas.length > 0 && (
        <Secao titulo="Domínio público e acesso aberto · grátis">
          <div className="cartao-ui flex flex-col gap-0 p-0">
            {fontesAbertas.map((f) => (
              <LinhaFonte key={f.id} f={f} aoMudar={carregar} podeAdicionar={!dados.arquivos.some((a) => a.fonte_url && a.fonte_url.startsWith(f.url.replace(/\/$/, "")))} />
            ))}
          </div>
        </Secao>
      )}

      {outrasFontes.length > 0 && (
        <Secao titulo="Fontes das aulas">
          <div className="cartao-ui flex flex-col gap-0 p-0">
            {outrasFontes.map((f) => (
              <LinhaFonte key={f.id} f={f} aoMudar={carregar} podeAdicionar={false} />
            ))}
          </div>
        </Secao>
      )}

      <p className="px-1 text-[13px] leading-relaxed text-texto-2">
        Envie PDF, EPUB ou seus destaques do Kindle de obras que você possui. As aulas usam esses arquivos e citam capítulo e página. A busca de PDF só traz obras de domínio público, de acesso aberto ou de fontes oficiais.
      </p>

      <FolhaEnvio arquivo={envio} recursos={dados.recursos} userId={userId} aoFechar={() => setEnvio(null)} aoConcluir={carregar} />
      <FolhaBuscaPdf estado={buscaPdf} aoFechar={() => setBuscaPdf(null)} aoConcluir={carregar} />
    </div>
  );
}

function LinhaArquivo({ a, recurso, recursos, aoMudar, temaDe }: { a: ArquivoBiblioteca; recurso?: Recurso; recursos: Recurso[]; aoMudar: () => void; temaDe: (id: string | null) => string | undefined }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="flex flex-col gap-2 border-b border-borda px-4 py-3 last:border-b-0">
      <button type="button" onClick={() => setAberto(!aberto)} className="flex cursor-pointer items-center gap-3 text-left" aria-expanded={aberto}>
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-superficie-2">
          <IconeTipoFonte tipo="livro" tamanho={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-snug font-semibold">{a.titulo}</span>
          <span className="block text-[13px] text-texto-2">
            {[a.autor, FORMATO_ROTULO[a.formato], a.status === "pronto" ? `${a.total_trechos} trechos` : a.status === "processando" ? "processando…" : "erro"].filter(Boolean).join(" · ")}
          </span>
          {recurso && <span className="block text-[13px] text-texto-2">Na trilha: {recurso.titulo}</span>}
        </span>
        {a.status === "pronto" && <IconeCheck className="text-ok" />}
      </button>
      {a.status === "erro" && a.erro && <p className="text-[13px] text-perigo">{a.erro}</p>}
      {aberto && (
        <div className="flex flex-col gap-2 pl-12">
          <label className="text-[13px] text-texto-2">
            Vincular a um recurso da trilha
            <select className="campo mt-1 py-2 text-sm" value={a.recurso_id ?? ""} onChange={async (e) => (await vincularRecurso(a.id, e.target.value || null), aoMudar())}>
              <option value="">Nenhum</option>
              {recursos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.titulo}
                  {r.tema_id ? ` (${temaDe(r.tema_id)})` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            {a.status === "erro" && (
              <button type="button" className="botao h-9 rounded-full bg-superficie-2 px-3 text-[13px]" onClick={async () => (await reprocessarArquivo(a.id).catch(() => {}), aoMudar())}>
                Processar de novo
              </button>
            )}
            <button
              type="button"
              className="botao h-9 rounded-full bg-superficie-2 px-3 text-[13px] text-perigo"
              onClick={async () => {
                if (!confirm(`Excluir “${a.titulo}” e os trechos indexados?`)) return;
                await excluirArquivo(a);
                aoMudar();
              }}
            >
              <IconeLixo /> Excluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaFonte({ f, podeAdicionar, aoMudar }: { f: Fonte; podeAdicionar: boolean; aoMudar: () => void }) {
  const [estado, setEstado] = useState<"" | "enviando" | "ok" | string>("");
  return (
    <div className="flex flex-col gap-2 border-b border-borda px-4 py-3 last:border-b-0">
      <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-superficie-2">
          <IconeTipoFonte tipo={f.tipo} tamanho={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-snug font-semibold">{f.titulo}</span>
          <span className="block text-[13px] text-texto-2">{[f.autor, f.acesso, f.gratuita ? "gratuita" : "paga"].filter(Boolean).join(" · ")}</span>
        </span>
        <IconeExterno className="flex-none text-texto-3" />
      </a>
      <div className="flex flex-wrap gap-2 pl-12">
        <button
          type="button"
          aria-pressed={f.consumido}
          className={`botao h-9 rounded-full px-3 text-[13px] ${f.consumido ? "bg-texto text-fundo" : "bg-superficie-2"}`}
          onClick={async () => (await marcarConsumida(f.url, !f.consumido), aoMudar())}
        >
          {f.consumido && <IconeCheck />}
          Consumido
        </button>
        {podeAdicionar && (
          <button
            type="button"
            disabled={estado === "enviando" || estado === "ok"}
            className="botao h-9 rounded-full bg-superficie-2 px-3 text-[13px]"
            onClick={async () => {
              setEstado("enviando");
              try {
                await adicionarObraAberta({ url: f.url, titulo: f.titulo, autor: f.autor });
                setEstado("ok");
                aoMudar();
              } catch (e) {
                setEstado((e as Error).message);
              }
            }}
          >
            <IconeMais tamanho={14} />
            {estado === "enviando" ? "Adicionando…" : estado === "ok" ? "Na biblioteca" : "Adicionar à biblioteca"}
          </button>
        )}
      </div>
      {estado && !["enviando", "ok"].includes(estado) && <p className="pl-12 text-[13px] text-perigo">{estado}</p>}
    </div>
  );
}

function BuscaTrechos() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Awaited<ReturnType<typeof buscarNaBiblioteca>> | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (q.trim().length >= 3) setRes(await buscarNaBiblioteca(q).catch(() => []));
      }}
    >
      <label className="relative block">
        <span className="sr-only">Buscar nos seus livros</span>
        <IconeBusca className="absolute top-1/2 left-3.5 -translate-y-1/2 text-texto-3" />
        <input className="campo pl-11" placeholder="Buscar nos seus livros" value={q} onChange={(e) => (setQ(e.target.value), e.target.value === "" && setRes(null))} />
      </label>
      {res && (
        <div className="flex flex-col gap-2">
          {res.length === 0 && <p className="px-1 text-sm text-texto-2">Nenhum trecho encontrado.</p>}
          {res.map((t) => (
            <div key={t.id} className="rounded-2xl border border-borda bg-superficie p-3.5">
              <div className="text-[13px] font-semibold">
                {t.titulo}
                <span className="font-normal text-texto-2">{[t.capitulo, t.pagina ? `p. ${t.pagina}` : null].filter(Boolean).map((x) => ` · ${x}`)}</span>
              </div>
              <p className="mt-1.5 line-clamp-4 font-serif text-[15px] leading-relaxed">{t.texto}</p>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}

function FolhaEnvio({ arquivo, recursos, userId, aoFechar, aoConcluir }: { arquivo: File | null; recursos: Recurso[]; userId: string; aoFechar: () => void; aoConcluir: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");
  const [recursoId, setRecursoId] = useState("");
  const [kindle, setKindle] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nomeVisto, setNomeVisto] = useState<string | null>(null);

  if (arquivo && arquivo.name !== nomeVisto) {
    setNomeVisto(arquivo.name);
    setTitulo(arquivo.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    setKindle(/clippings/i.test(arquivo.name));
    setErro(null);
  }

  return (
    <Folha aberta={!!arquivo} aoFechar={aoFechar} rotulo="Enviar arquivo">
      <div className="rotulo">Enviar para a biblioteca</div>
      <p className="text-sm text-texto-2">{arquivo?.name}</p>
      <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
        Título
        <input className="campo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
        Autor
        <input className="campo" value={autor} onChange={(e) => setAutor(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
        Vincular a um recurso da trilha
        <select className="campo" value={recursoId} onChange={(e) => setRecursoId(e.target.value)}>
          <option value="">Nenhum</option>
          {recursos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.titulo}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={kindle} onChange={(e) => setKindle(e.target.checked)} className="h-5 w-5" />É o My Clippings.txt (destaques do Kindle)
      </label>
      <Aviso>Envie apenas arquivos de obras que você adquiriu legalmente. O arquivo fica privado, só na sua conta.</Aviso>
      {erro && <p className="text-sm text-perigo">{erro}</p>}
      <button
        type="button"
        className="botao-primario"
        disabled={enviando || !titulo.trim()}
        onClick={async () => {
          if (!arquivo) return;
          setEnviando(true);
          setErro(null);
          try {
            await enviarArquivo(userId, arquivo, { titulo: titulo.trim(), autor: autor.trim() || null, recurso_id: recursoId || null, kindle });
            aoConcluir();
            aoFechar();
          } catch (e) {
            setErro((e as Error).message);
            aoConcluir();
          } finally {
            setEnviando(false);
          }
        }}
      >
        {enviando ? "Enviando e indexando…" : "Enviar"}
      </button>
    </Folha>
  );
}

function FolhaBuscaPdf({ estado, aoFechar, aoConcluir }: { estado: { consulta: string; recursoId: string | null } | null; aoFechar: () => void; aoConcluir: () => void }) {
  const [consulta, setConsulta] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [res, setRes] = useState<{ fontes: FonteEncontrada[]; observacao: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [adicionados, setAdicionados] = useState<Record<string, string>>({});
  const [aberto, setAberto] = useState<typeof estado>(null);

  if (estado !== aberto) {
    setAberto(estado);
    setConsulta(estado?.consulta ?? "");
    setRes(null);
    setErro(null);
    setAdicionados({});
  }

  async function buscar() {
    setBuscando(true);
    setErro(null);
    try {
      setRes(await buscarPdfLegal(consulta));
    } catch (e) {
      setErro((e as Error).message);
      setRes(null);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Folha aberta={!!estado} aoFechar={aoFechar} rotulo="Buscar PDF legal">
      <div className="rotulo">Buscar PDF legal</div>
      <p className="text-sm leading-relaxed text-texto-2">Só obras de domínio público, de acesso aberto ou de fontes oficiais. Livros protegidos não aparecem aqui: use a prévia, o empréstimo ou a compra.</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <input className="campo" placeholder="Título e autor (ex.: Meditações, Marco Aurélio)" value={consulta} onChange={(e) => setConsulta(e.target.value)} />
        <button className="botao h-[50px] flex-none rounded-xl bg-texto px-4 text-fundo" disabled={buscando || consulta.trim().length < 3} aria-label="Buscar">
          <IconeBusca />
        </button>
      </form>
      {buscando && <p className="text-sm text-texto-2">Buscando em acervos de domínio público e fontes oficiais…</p>}
      {erro && <p className="text-sm text-perigo">{erro}</p>}
      {res && (
        <div className="flex flex-col gap-2">
          {res.observacao && <Aviso>{res.observacao}</Aviso>}
          {res.fontes.map((f) => (
            <div key={f.url} className="flex items-center gap-3 rounded-2xl border border-borda p-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug font-semibold">{f.titulo}</span>
                <span className="block truncate text-[13px] text-texto-2">
                  {f.acesso} · {new URL(f.url).hostname.replace(/^www\./, "")}
                </span>
              </span>
              <button
                type="button"
                className="botao h-9 flex-none rounded-full bg-superficie-2 px-3 text-[13px]"
                disabled={!!adicionados[f.url]}
                onClick={async () => {
                  setAdicionados((x) => ({ ...x, [f.url]: "enviando" }));
                  try {
                    await adicionarObraAberta({ url: f.url, titulo: f.titulo, recurso_id: estado?.recursoId ?? null });
                    setAdicionados((x) => ({ ...x, [f.url]: "ok" }));
                    aoConcluir();
                  } catch (e) {
                    setAdicionados((x) => ({ ...x, [f.url]: "" }));
                    setErro((e as Error).message);
                  }
                }}
              >
                {adicionados[f.url] === "ok" ? "Adicionado" : adicionados[f.url] === "enviando" ? "Baixando…" : "Adicionar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </Folha>
  );
}
