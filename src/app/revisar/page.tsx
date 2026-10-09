"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppShell";
import { CaixaErro, corPilar, Esqueleto, Ponto, Rodape, TopoFluxo } from "@/components/ui";
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

  if (erro) return <div className="p-5"><CaixaErro mensagem={erro} /></div>;
  if (!fila) return <div className="p-5"><Esqueleto /></div>;

  const pilar = pilares.find((p) => p.id === atual?.pilar_id);
  const previa = atual && mostrando ? previaIntervalos(atual.agendamento, new Date(), config.algoritmo) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopoFluxo href="/" titulo={atual ? `${fila.length} ${fila.length === 1 ? "restante" : "restantes"}` : "Fixar"} rotuloFechar="Fechar revisão">
        <div className="flex items-center justify-between gap-3 px-2">
          <span className="num text-[13px] text-texto-2">
            {feitos} revisados{feitos > 0 && ` · ${Math.round((acertos / feitos) * 100)}% de acerto`}
          </span>
          <select className="h-9 max-w-[55%] cursor-pointer rounded-full bg-superficie-2 px-3 text-[13px] font-semibold" value={pilarId} onChange={(e) => setPilarId(e.target.value)} aria-label="Filtrar por pilar">
            <option value="">Todos os pilares</option>
            {pilares.map((p) => (
              <option key={p.id} value={p.id}>
                {p.numero ? `${p.numero}. ` : ""}
                {p.nome}
              </option>
            ))}
          </select>
        </div>
      </TopoFluxo>

      {!atual ? (
        <main className="flex flex-1 flex-col justify-center gap-4 px-6 pb-16">
          <h1 className="titulo-cartao">{feitos ? "Revisão concluída" : "Nada para revisar agora"}</h1>
          <p className="text-[15px] text-texto-2">O sistema já agendou as próximas revisões.</p>
          <div className="flex gap-2.5">
            <Link href="/" className="botao-primario flex-1">
              Voltar para Hoje
            </Link>
            <Link href="/cartoes" className="botao-secundario flex-1">
              Criar cartão
            </Link>
          </div>
        </main>
      ) : (
        <>
          <main className="flex flex-1 flex-col px-5 pt-5">
            <article className="cartao-destaque flex flex-1 cursor-pointer flex-col gap-4 rounded-3xl p-6" onClick={() => setMostrando(true)}>
              <div className="flex flex-wrap items-center gap-1.5">
                {pilar && (
                  <span className="chip">
                    <Ponto cor={corPilar(pilar.numero)} />
                    {pilar.nome}
                  </span>
                )}
                {atual.proxima_revisao === null && <span className="chip">novo</span>}
              </div>
              <h1 className="font-serif text-[26px] leading-[1.25] font-medium tracking-[-0.01em] whitespace-pre-wrap">{atual.frente}</h1>
              {mostrando ? (
                <div className="flex flex-col gap-2 border-t border-borda pt-4">
                  <p className="text-[17px] leading-relaxed whitespace-pre-wrap">{atual.verso}</p>
                  {atual.tags.length > 0 && <div className="text-xs text-texto-2">{atual.tags.join(" · ")}</div>}
                </div>
              ) : (
                <p className="mt-auto text-center text-sm text-texto-2">Tente lembrar antes de revelar.</p>
              )}
            </article>
          </main>
          <Rodape>
            {mostrando ? (
              <>
                <div className="text-center text-[13px] font-semibold text-texto-2">Como foi lembrar?</div>
                <div className="grid grid-cols-4 gap-2">
                  {BOTOES.map((b) => (
                    <button
                      key={b.valor}
                      type="button"
                      onClick={() => responder(b.valor)}
                      title={`${b.dica} (tecla ${b.valor})`}
                      className={`flex h-[58px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[14px] text-[15px] font-semibold ${b.valor === 3 ? "bg-texto text-fundo" : "border border-borda bg-superficie"}`}
                    >
                      <span>{b.rotulo}</span>
                      {previa && <span className="text-[11px] font-medium opacity-75">{formatarIntervalo(previa[b.valor])}</span>}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <button type="button" className="botao-primario h-[52px]" onClick={() => setMostrando(true)}>
                Mostrar resposta
              </button>
            )}
          </Rodape>
        </>
      )}
    </div>
  );
}
