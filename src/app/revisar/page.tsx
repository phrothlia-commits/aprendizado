"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppShell";
import { BOTOES, formatarIntervalo, previaIntervalos, type Botao } from "@/lib/agendamento";
import { cartoesParaRevisar, registrarRevisao } from "@/lib/db";
import { montarFila } from "@/lib/fila";
import type { Cartao } from "@/lib/tipos";

/** Cartões que voltam em menos de 20 min reaparecem na mesma sessão. */
const REPETIR_NA_SESSAO_DIAS = 20 / (24 * 60);

export default function Revisar() {
  const { pilares, config } = useApp();
  const [pilarId, setPilarId] = useState<string>("");
  const [fila, setFila] = useState<Cartao[] | null>(null);
  const [mostrando, setMostrando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [acertos, setAcertos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const inicio = useRef(0);
  const salvando = useRef(false);

  useEffect(() => {
    let cancelado = false;
    cartoesParaRevisar().then(
      (r) => {
        if (cancelado) return;
        const { fila } = montarFila({
          vencidos: r.vencidos,
          novos: r.novos,
          limiteRevisoes: config.revisoes_por_dia,
          limiteNovos: config.novos_por_dia,
          revisoesFeitasHoje: r.revisoesHoje,
          novosFeitosHoje: r.novosHoje,
          pilarId: pilarId || null,
        });
        setFila(fila);
        setMostrando(false);
        inicio.current = Date.now();
      },
      (e) => setErro((e as Error).message),
    );
    return () => {
      cancelado = true;
    };
  }, [config, pilarId]);

  const atual = fila?.[0];

  const responder = useCallback(
    async (botao: Botao) => {
      if (!atual || salvando.current) return;
      salvando.current = true;
      const tempo = Date.now() - inicio.current;
      try {
        const r = await registrarRevisao(atual, botao, tempo, config.algoritmo);
        const atualizado: Cartao = { ...atual, agendamento: r.estado, proxima_revisao: r.proximaRevisao.toISOString() };
        setFila((f) => {
          const resto = (f ?? []).slice(1);
          return r.intervaloNovoDias <= REPETIR_NA_SESSAO_DIAS ? [...resto, atualizado] : resto;
        });
        setFeitos((n) => n + 1);
        if (botao > 1) setAcertos((n) => n + 1);
        setMostrando(false);
        inicio.current = Date.now();
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        salvando.current = false;
      }
    },
    [atual, config.algoritmo],
  );

  // Atalhos: espaço revela; 1–4 avaliam.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === "SELECT") return;
      if (!mostrando && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setMostrando(true);
      } else if (mostrando && ["1", "2", "3", "4"].includes(e.key)) {
        responder(Number(e.key) as Botao);
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [mostrando, responder]);

  if (erro) return <p className="text-perigo">{erro}</p>;
  if (!fila) return <div className="h-64 animate-pulse rounded-xl bg-superficie-2" />;

  const pilar = pilares.find((p) => p.id === atual?.pilar_id);
  const previa = atual && mostrando ? previaIntervalos(atual.agendamento, new Date(), config.algoritmo) : null;

  return (
    <div className="flex min-h-[70dvh] flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="titulo-pagina">Revisar</h1>
        <select className="campo w-auto py-1.5 text-sm" value={pilarId} onChange={(e) => setPilarId(e.target.value)} aria-label="Filtrar por pilar">
          <option value="">Todos os pilares</option>
          {pilares.map((p) => (
            <option key={p.id} value={p.id}>
              {p.numero ? `${p.numero}. ` : ""}
              {p.nome}
            </option>
          ))}
        </select>
      </header>

      <p className="text-sm text-texto-2">
        {fila.length} restantes · {feitos} revisados nesta sessão
        {feitos > 0 && ` · ${Math.round((acertos / feitos) * 100)}% de acerto`}
      </p>

      {!atual ? (
        <div className="cartao-ui grid flex-1 place-items-center text-center">
          <div className="space-y-3">
            <p className="text-lg font-semibold">{feitos ? "Revisão concluída ✓" : "Nada para revisar agora"}</p>
            <p className="text-sm text-texto-2">O sistema já agendou as próximas revisões.</p>
            <div className="flex justify-center gap-2">
              <Link href="/" className="botao-secundario">
                Voltar para Hoje
              </Link>
              <Link href="/cartoes" className="botao-secundario">
                Criar cartão
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          <article
            className="cartao-ui flex flex-1 cursor-pointer flex-col gap-4 border-l-4"
            style={{ borderLeftColor: pilar?.cor ?? undefined }}
            onClick={() => setMostrando(true)}
          >
            <div className="flex flex-wrap gap-1.5 text-xs text-texto-2">
              {pilar && <span>{pilar.nome}</span>}
              {atual.proxima_revisao === null && <span className="rounded bg-destaque/15 px-1.5 text-destaque">novo</span>}
              {atual.tags.map((t) => (
                <span key={t} className="rounded bg-superficie-2 px-1.5">
                  {t}
                </span>
              ))}
            </div>
            <p className="whitespace-pre-wrap text-xl leading-snug">{atual.frente}</p>
            {mostrando ? (
              <>
                <hr className="border-borda" />
                <p className="whitespace-pre-wrap text-lg leading-snug text-texto">{atual.verso}</p>
              </>
            ) : (
              <p className="mt-auto text-center text-sm text-texto-2">Tente lembrar antes de revelar.</p>
            )}
          </article>

          {mostrando ? (
            <div className="sticky bottom-24 grid grid-cols-4 gap-2 md:bottom-4">
              {BOTOES.map((b) => (
                <button
                  key={b.valor}
                  onClick={() => responder(b.valor)}
                  title={`${b.dica} (tecla ${b.valor})`}
                  className={`botao flex-col gap-0 border py-3 ${
                    b.valor === 1 ? "border-perigo text-perigo" : b.valor === 3 ? "border-destaque bg-destaque text-destaque-texto" : "border-borda bg-superficie"
                  }`}
                >
                  <span>{b.rotulo}</span>
                  {previa && <span className="text-[11px] font-normal opacity-80">{formatarIntervalo(previa[b.valor])}</span>}
                </button>
              ))}
            </div>
          ) : (
            <button className="botao-primario sticky bottom-24 py-4 text-base md:bottom-4" onClick={() => setMostrando(true)}>
              Mostrar resposta
            </button>
          )}
        </>
      )}
    </div>
  );
}
