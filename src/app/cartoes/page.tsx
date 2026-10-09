"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppShell";
import { CabecalhoVoltar } from "@/components/ui";
import { baixarArquivo, lerCsvCartoes, paraCsv } from "@/lib/csv";
import { dataLocal } from "@/lib/datas";
import { atualizarCartao, buscarCartoes, contarCartoes, criarCartoes, excluirCartao, todasTags, todosCartoes, type NovoCartao } from "@/lib/db";
import { TIPOS_CARTAO, type Cartao, type TipoCartao } from "@/lib/tipos";

const ULTIMO_PILAR = "trilha:ultimo-pilar";

function lerPreferencia(chave: string): string {
  try {
    return localStorage.getItem(chave) ?? "";
  } catch {
    return "";
  }
}

function separarTags(s: string): string[] {
  return [...new Set(s.split(/[;,\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

export default function Cartoes() {
  const { pilares, temas } = useApp();
  const [lista, setLista] = useState<Cartao[] | null>(null);
  const [total, setTotal] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  const [filtroPilar, setFiltroPilar] = useState("");
  const [filtroTag, setFiltroTag] = useState("");
  const [editando, setEditando] = useState<Cartao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const [l, n, t] = await Promise.all([
      buscarCartoes({ texto, pilarId: filtroPilar || undefined, tag: filtroTag || undefined }),
      contarCartoes(),
      todasTags(),
    ]);
    setLista(l);
    setTotal(n);
    setTags(t);
  }, [texto, filtroPilar, filtroTag]);

  useEffect(() => {
    const t = setTimeout(() => carregar().catch((e) => setAviso(e.message)), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  async function importar(f: File) {
    const { linhas, erros } = lerCsvCartoes(await f.text());
    const porNumero = new Map(pilares.map((p) => [p.numero, p.id]));
    const novos: NovoCartao[] = linhas.map((l) => ({
      frente: l.frente,
      verso: l.verso,
      tipo: "basico",
      pilar_id: l.pilar !== null ? (porNumero.get(l.pilar) ?? null) : null,
      tema_id: null,
      tags: l.tags,
      origem: "importado",
      fonte: f.name,
    }));
    for (let i = 0; i < novos.length; i += 500) await criarCartoes(novos.slice(i, i + 500));
    setAviso(`${novos.length} cartões importados.${erros.length ? ` ${erros.length} linhas ignoradas: ${erros.slice(0, 3).join("; ")}` : ""}`);
    carregar();
  }

  async function exportar() {
    const todos = await todosCartoes();
    const numero = new Map(pilares.map((p) => [p.id, p.numero]));
    baixarArquivo(
      `cartoes-${dataLocal()}.csv`,
      paraCsv(todos.map((c) => ({ frente: c.frente, verso: c.verso, pilar: c.pilar_id ? numero.get(c.pilar_id) : "", tags: c.tags }))),
      "text/csv;charset=utf-8",
    );
  }

  const nomePilar = (id: string | null) => pilares.find((p) => p.id === id)?.nome;
  const nomeTema = (id: string | null) => temas.find((t) => t.id === id)?.nome;

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoVoltar voltar="/voce" sobre="Você" titulo="Cartões" />
      <header className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex gap-2">
          <button className="botao h-10 rounded-full bg-superficie-2 px-3.5 text-[13px]" onClick={() => arquivo.current?.click()}>
            Importar CSV
          </button>
          <button className="botao h-10 rounded-full bg-superficie-2 px-3.5 text-[13px]" onClick={exportar}>
            Exportar CSV
          </button>
          <input
            ref={arquivo}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importar(f).catch((er) => setAviso(er.message));
              e.target.value = "";
            }}
          />
        </div>
      </header>
      <p className="text-xs text-texto-2">CSV com colunas: frente, verso, pilar (1 a 8), tags (separadas por “;”).</p>

      {aviso && (
        <p className="rounded-lg bg-superficie-2 px-3 py-2 text-sm" onClick={() => setAviso(null)}>
          {aviso}
        </p>
      )}

      <FormCartao
        key={editando?.id ?? "novo"}
        inicial={editando}
        onCancelar={editando ? () => setEditando(null) : undefined}
        onSalvar={async (dados) => {
          if (editando) {
            await atualizarCartao(editando.id, dados);
            setEditando(null);
          } else {
            await criarCartoes([{ ...dados, origem: "manual" }]);
          }
          carregar();
        }}
      />

      <section className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="campo" placeholder="Buscar na frente ou no verso" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <select className="campo" value={filtroPilar} onChange={(e) => setFiltroPilar(e.target.value)}>
            <option value="">Todos os pilares</option>
            {pilares.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <select className="campo" value={filtroTag} onChange={(e) => setFiltroTag(e.target.value)}>
            <option value="">Todas as tags</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-texto-2">
          {lista ? `${lista.length} exibidos` : "Carregando…"} · {total} no total
        </p>
        <ul className="flex flex-col gap-2">
          {lista?.map((c) => (
            <li key={c.id} className={`cartao-ui ${c.suspenso ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap font-medium">{c.frente}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-texto-2">{c.verso}</p>
                  <p className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-texto-2">
                    {nomePilar(c.pilar_id) && <span>{nomePilar(c.pilar_id)}</span>}
                    {nomeTema(c.tema_id) && <span>· {nomeTema(c.tema_id)}</span>}
                    <span>· {TIPOS_CARTAO[c.tipo]}</span>
                    <span>· {c.proxima_revisao ? `revisão ${new Date(c.proxima_revisao).toLocaleDateString("pt-BR")}` : "novo"}</span>
                    {c.origem === "ia" && <span>· gerado por IA</span>}
                    {c.tags.map((t) => (
                      <span key={t} className="rounded bg-superficie-2 px-1.5">
                        {t}
                      </span>
                    ))}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1 text-xs">
                  <button className="font-semibold text-texto" onClick={() => (setEditando(c), window.scrollTo({ top: 0, behavior: "smooth" }))}>
                    Editar
                  </button>
                  <button
                    className="text-texto-2"
                    onClick={async () => {
                      await atualizarCartao(c.id, { suspenso: !c.suspenso });
                      carregar();
                    }}
                  >
                    {c.suspenso ? "Reativar" : "Suspender"}
                  </button>
                  <button
                    className="text-perigo"
                    onClick={async () => {
                      if (!confirm("Excluir este cartão e o histórico de revisões dele?")) return;
                      await excluirCartao(c.id);
                      carregar();
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function FormCartao({
  inicial,
  onSalvar,
  onCancelar,
}: {
  inicial: Cartao | null;
  onSalvar: (c: NovoCartao) => Promise<void>;
  onCancelar?: () => void;
}) {
  const { pilares, temas } = useApp();
  const [frente, setFrente] = useState(inicial?.frente ?? "");
  const [verso, setVerso] = useState(inicial?.verso ?? "");
  const [tipo, setTipo] = useState<TipoCartao>(inicial?.tipo ?? "basico");
  // Novo cartão herda o último pilar usado (criar em menos de 20 s).
  const [pilarId, setPilarId] = useState(() => (inicial ? (inicial.pilar_id ?? "") : lerPreferencia(ULTIMO_PILAR)));
  const [temaId, setTemaId] = useState(inicial?.tema_id ?? "");
  const [tags, setTags] = useState(inicial?.tags.join("; ") ?? "");
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const refFrente = useRef<HTMLTextAreaElement>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!frente.trim() || !verso.trim()) return;
    setSalvando(true);
    try {
      await onSalvar({
        frente: frente.trim(),
        verso: verso.trim(),
        tipo,
        pilar_id: pilarId || null,
        tema_id: temaId || null,
        tags: separarTags(tags),
      });
      try {
        localStorage.setItem(ULTIMO_PILAR, pilarId);
      } catch {}
      if (!inicial) {
        setFrente("");
        setVerso("");
        setOk(true);
        setTimeout(() => setOk(false), 1500);
        refFrente.current?.focus();
      }
    } finally {
      setSalvando(false);
    }
  }

  const temasDoPilar = temas.filter((t) => t.pilar_id === pilarId);

  return (
    <form onSubmit={salvar} className="cartao-ui flex flex-col gap-3">
      <p className="rotulo">{inicial ? "Editar cartão" : "Novo cartão"}</p>
      <div className="flex gap-1.5">
        {(Object.keys(TIPOS_CARTAO) as TipoCartao[]).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTipo(t)}
            className={`rounded-full border px-3 py-1 text-xs ${tipo === t ? "border-texto bg-texto text-fundo" : "border-borda"}`}
          >
            {TIPOS_CARTAO[t]}
          </button>
        ))}
      </div>
      <textarea
        ref={refFrente}
        className="campo min-h-20"
        placeholder={tipo === "por_que" ? "Por que …?" : tipo === "idioma" ? "Palavra + frase de exemplo" : "Pergunta"}
        value={frente}
        onChange={(e) => setFrente(e.target.value)}
        required
      />
      <textarea
        className="campo min-h-20"
        placeholder={tipo === "por_que" ? "Explicação com suas palavras" : "Resposta"}
        value={verso}
        onChange={(e) => setVerso(e.target.value)}
        required
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) salvar(e);
        }}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <select className="campo" value={pilarId} onChange={(e) => (setPilarId(e.target.value), setTemaId(""))}>
          <option value="">Sem pilar</option>
          {pilares.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <select className="campo" value={temaId} onChange={(e) => setTemaId(e.target.value)} disabled={!temasDoPilar.length}>
          <option value="">Sem tema</option>
          {temasDoPilar.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <input className="campo" placeholder="tags; separadas; por ponto e vírgula" value={tags} onChange={(e) => setTags(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <button className="botao-primario" disabled={salvando}>
          {inicial ? "Salvar alterações" : "Adicionar"}
        </button>
        {onCancelar && (
          <button type="button" className="botao-secundario" onClick={onCancelar}>
            Cancelar
          </button>
        )}
        {ok && <span className="text-sm font-semibold text-ok">Criado ✓</span>}
      </div>
    </form>
  );
}
