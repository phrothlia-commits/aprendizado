"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { dataLocal } from "@/lib/datas";
import { atualizarTema, dadosTrilha, salvarNotasTrimestre, trocarTrimestres } from "@/lib/db";
import { NIVEIS, STATUS_TEMA, type Nivel, type StatusTema, type Tema, type Trimestre } from "@/lib/tipos";

type Dados = Awaited<ReturnType<typeof dadosTrilha>>;

const PRIORIDADE: Record<string, string> = { A: "A · retorno direto", B: "B · base estratégica", C: "C · paixão e profundidade", continua: "contínua" };

export default function Trilha() {
  const { pilares, temas, recarregar } = useApp();
  const [d, setD] = useState<Dados | null>(null);
  const [aba, setAba] = useState<"cronograma" | "pilares" | "idiomas">("cronograma");
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  const carregar = useCallback(() => {
    dadosTrilha().then(setD);
  }, []);
  useEffect(carregar, [carregar]);

  if (!d) return <div className="h-64 animate-pulse rounded-xl bg-superficie-2" />;
  const hoje = dataLocal();

  async function mover(lista: Trimestre[], i: number, dir: -1 | 1) {
    await trocarTrimestres(lista[i], lista[i + dir]);
    carregar();
  }

  return (
    <div className="space-y-5">
      <h1 className="titulo-pagina">Trilha</h1>
      <div className="flex gap-1 rounded-lg bg-superficie-2 p-1 text-sm">
        {(["cronograma", "pilares", "idiomas"] as const).map((a) => (
          <button key={a} onClick={() => setAba(a)} className={`flex-1 rounded-md py-1.5 capitalize ${aba === a ? "bg-superficie font-semibold shadow-sm" : "text-texto-2"}`}>
            {a}
          </button>
        ))}
      </div>

      {aba === "cronograma" && (
        <section className="space-y-3">
          {d.ciclos.map((c) => (
            <p key={c.id} className="text-sm text-texto-2">
              Ciclo {c.numero} ({c.nivel}): {new Date(c.data_inicio + "T12:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })} a{" "}
              {new Date(c.data_fim + "T12:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}. Ao fim de cada trimestre, revise a fila e reordene os próximos núcleos. Nenhum tema é removido.
            </p>
          ))}
          <ol className="space-y-2">
            {d.trimestres.map((t, i, lista) => {
              const passado = t.data_fim < hoje;
              const atual = t.data_inicio <= hoje && hoje <= t.data_fim;
              const podeSubir = !passado && !atual && i > 0 && lista[i - 1].data_inicio > hoje;
              const podeDescer = !passado && !atual && i < lista.length - 1;
              return (
                <li key={t.id} className={`cartao-ui ${atual ? "border-destaque" : ""} ${passado ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-texto-2">
                        T{t.ordem} · {t.periodo} {atual && <span className="font-semibold text-destaque">· atual</span>}
                      </p>
                      <p className="font-semibold">{t.nucleo_titulo}</p>
                      <p className="text-sm text-texto-2">Paralela: {t.paralela_titulo}</p>
                      {t.idiomas_foco && <p className="text-sm text-texto-2">Idiomas: {t.idiomas_foco}</p>}
                    </div>
                    {(podeSubir || podeDescer) && (
                      <div className="flex flex-col gap-1">
                        <button className="botao-secundario px-2 py-1" disabled={!podeSubir} onClick={() => mover(lista, i, -1)} aria-label="Antecipar">
                          ↑
                        </button>
                        <button className="botao-secundario px-2 py-1" disabled={!podeDescer} onClick={() => mover(lista, i, 1)} aria-label="Adiar">
                          ↓
                        </button>
                      </div>
                    )}
                  </div>
                  {(atual || passado) && <NotasTrimestre t={t} />}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {aba === "pilares" && (
        <section className="space-y-3">
          {pilares.map((p) => {
            const ts = temas.filter((t) => t.pilar_id === p.id);
            const aberto = abertos[p.id];
            return (
              <div key={p.id} className="cartao-ui border-l-4" style={{ borderLeftColor: p.cor ?? undefined }}>
                <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setAbertos({ ...abertos, [p.id]: !aberto })}>
                  <div>
                    <p className="font-semibold">
                      {p.numero ? `${p.numero}. ` : ""}
                      {p.nome}
                    </p>
                    <p className="text-xs text-texto-2">Prioridade {PRIORIDADE[p.prioridade]}</p>
                  </div>
                  <span className="text-xs text-texto-2">
                    {ts.filter((t) => t.status === "ativo").length} ativo(s) · {ts.length} temas {aberto ? "▲" : "▼"}
                  </span>
                </button>
                {aberto && (
                  <ul className="mt-3 divide-y divide-borda">
                    {ts.map((t) => (
                      <LinhaTema key={t.id} tema={t} onMudou={recarregar} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}

      {aba === "idiomas" && (
        <section className="space-y-3">
          <p className="text-sm text-texto-2">Estudados em sequência, nunca dois novos em paralelo.</p>
          {d.idiomas.map((i) => (
            <div key={i.id} className="cartao-ui">
              <div className="flex items-baseline justify-between">
                <p className="font-semibold">{i.nome}</p>
                <p className="text-sm">
                  <span className="font-semibold">{i.nivel_atual}</span> → {i.meta} · <span className="text-texto-2">{i.status}</span>
                </p>
              </div>
              {i.motivo && <p className="text-sm text-texto-2">{i.motivo}</p>}
              <p className="text-xs text-texto-2">{i.horas_acumuladas} h acumuladas</p>
              {i.marcos.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {i.marcos.map((m) => (
                    <li key={m.titulo} className={m.atingido_em ? "text-sucesso" : ""}>
                      {m.atingido_em ? "✓" : "○"} {m.titulo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <p className="text-xs text-texto-2">Registro de horas e marcos entra na Fase 2 (telas Prática e Progresso).</p>
        </section>
      )}

    </div>
  );
}

function NotasTrimestre({ t }: { t: Trimestre }) {
  const [texto, setTexto] = useState(t.notas_revisao ?? "");
  const [salvo, setSalvo] = useState(true);
  return (
    <div className="mt-3">
      <label className="rotulo">Revisão do trimestre</label>
      <textarea
        className="campo min-h-16 text-sm"
        placeholder="O que funcionou, o que esqueci, o que muda no próximo"
        value={texto}
        onChange={(e) => (setTexto(e.target.value), setSalvo(false))}
        onBlur={async () => {
          if (salvo) return;
          await salvarNotasTrimestre(t.id, texto);
          setSalvo(true);
        }}
      />
    </div>
  );
}

function LinhaTema({ tema, onMudou }: { tema: Tema; onMudou: () => Promise<void> }) {
  const [explicando, setExplicando] = useState(false);
  const [explicacao, setExplicacao] = useState(tema.explicacao_feynman ?? "");
  const idx = NIVEIS.findIndex((n) => n.valor === tema.nivel);
  const proximo = NIVEIS[idx + 1];

  async function salvar(patch: Parameters<typeof atualizarTema>[1]) {
    await atualizarTema(tema.id, patch);
    await onMudou();
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{tema.nome}</p>
        <div className="flex items-center gap-2 text-xs">
          <select className="campo w-auto py-1 text-xs" value={tema.status} onChange={(e) => salvar({ status: e.target.value as StatusTema })}>
            {(Object.keys(STATUS_TEMA) as StatusTema[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_TEMA[s]}
              </option>
            ))}
          </select>
          <span className="rounded bg-superficie-2 px-2 py-1">{NIVEIS[idx].rotulo}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className={tema.feynman_ok ? "text-sucesso" : "text-texto-2"}>{tema.feynman_ok ? "✓ Critério Feynman atingido" : "Critério Feynman pendente"}</span>
        <button className="text-destaque" onClick={() => setExplicando(!explicando)}>
          {explicando ? "Fechar" : "Explicar sem consultar"}
        </button>
        {proximo && (
          <button
            className="text-destaque disabled:text-texto-2 disabled:no-underline"
            disabled={!tema.feynman_ok}
            title={tema.feynman_ok ? "" : "Só avança quando você consegue explicar sem consultar"}
            onClick={() => salvar({ nivel: proximo.valor as Nivel, feynman_ok: false, status: "fila" })}
          >
            Avançar para {proximo.rotulo.toLowerCase()} →
          </button>
        )}
      </div>
      {explicando && (
        <div className="space-y-2">
          <textarea
            className="campo min-h-28 text-sm"
            placeholder="Explique o tema com palavras simples, como para alguém de 12 anos, sem consultar nada."
            value={explicacao}
            onChange={(e) => setExplicacao(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="botao-secundario text-xs" onClick={() => salvar({ explicacao_feynman: explicacao })}>
              Salvar rascunho
            </button>
            <button
              className="botao-primario text-xs"
              disabled={explicacao.trim().split(/\s+/).length < 30}
              onClick={async () => {
                await salvar({ explicacao_feynman: explicacao, feynman_ok: true });
                setExplicando(false);
              }}
            >
              Consegui explicar sem consultar
            </button>
          </div>
          <p className="text-[11px] text-texto-2">Mínimo de 30 palavras. Na Fase 3, o tutor de IA avalia a explicação.</p>
        </div>
      )}
    </li>
  );
}
