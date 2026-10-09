"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { formatarData } from "@/lib/datas";
import { dadosHoje, registrarSabedoria, salvarHabito } from "@/lib/db";
import { calcularSequencia, minutosRevisao, montarResumo, sabedoriaDoDia, trimestreAtual, type ModoDia } from "@/lib/hoje";

type Dados = Awaited<ReturnType<typeof dadosHoje>>;

export default function Hoje() {
  const { pilares, temas, config } = useApp();
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    dadosHoje().then(setD, (e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  if (erro) return <p className="text-perigo">{erro}</p>;
  if (!d) return <Esqueleto />;

  const modo: ModoDia = d.habito?.modo ?? "padrao";
  const checklist = d.habito?.checklist ?? {};
  const novosHojeRestantes = Math.max(0, Math.min(config.novos_por_dia - d.novosHoje, d.novosDisponiveis));
  const pendentes = Math.min(d.vencidos + novosHojeRestantes, Math.max(0, config.revisoes_por_dia - d.revisoesHoje));
  const diarioCompleto = Boolean(d.diario?.aprendizado_1 && d.diario?.aprendizado_2 && d.diario?.aprendizado_3);
  const resumo = montarResumo({ modo, data: d.hoje, checklist, cartoesPendentes: pendentes, revisoesHoje: d.revisoesHoje, diarioCompleto });
  const seq = calcularSequencia(d.diasAtivos, d.hoje);
  const { atual, proximo } = trimestreAtual(d.trimestres, d.hoje);
  const sabedoria = sabedoriaDoDia(d.hoje);
  const pilarDoTema = (id: string | null) => pilares.find((p) => p.id === temas.find((t) => t.id === id)?.pilar_id);

  async function alternar(id: string) {
    const novo = { ...checklist, [id]: !checklist[id] };
    setD((x) => x && { ...x, habito: { ...(x.habito ?? ({} as never)), modo, checklist: novo } });
    await salvarHabito(d!.hoje, { checklist: novo, modo });
    if (id === "sabedoria") await registrarSabedoria(d!.hoje, sabedoria.livro, sabedoria.referencia, novo[id]);
    carregar();
  }

  async function trocarModo() {
    const novoModo: ModoDia = modo === "padrao" ? "minimo" : "padrao";
    setD((x) => x && { ...x, habito: { ...(x.habito ?? ({} as never)), modo: novoModo, checklist } });
    await salvarHabito(d!.hoje, { modo: novoModo, checklist });
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-texto-2">{formatarData(d.hoje)}</p>
          <h1 className="titulo-pagina">Hoje</h1>
          <p className="mt-1 text-sm text-texto-2">
            {resumo.minutosRestantes > 0 ? `Faltam ~${resumo.minutosRestantes} min de ${resumo.minutosTotais} dedicados` : "Dia completo ✓"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold tabular-nums">{seq.dias}</p>
          <p className="text-xs text-texto-2">{seq.dias === 1 ? "dia seguido" : "dias seguidos"}</p>
          {!seq.hojeConta && seq.dias > 0 && <p className="text-xs text-alerta">faça algo hoje para manter</p>}
        </div>
      </header>

      <div className="h-1.5 overflow-hidden rounded-full bg-superficie-2">
        <div className="h-full bg-sucesso transition-all" style={{ width: `${Math.round(resumo.progresso * 100)}%` }} />
      </div>

      <button
        onClick={trocarModo}
        className={`w-full rounded-xl border px-4 py-3 text-left text-sm ${modo === "minimo" ? "border-alerta bg-alerta/10" : "border-borda bg-superficie"}`}
      >
        <span className="font-semibold">{modo === "minimo" ? "Modo mínimo ativo (~30 min)" : "Semana caótica? Ativar modo mínimo"}</span>
        <span className="block text-texto-2">
          {modo === "minimo" ? "Sabedoria, revisão e diário. Toque para voltar ao modo padrão." : "Sabedoria (10), revisão (15) e diário (5) mantêm a sequência."}
        </span>
      </button>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/revisar" className="cartao-ui block transition hover:border-destaque">
          <p className="rotulo">Revisar</p>
          <p className="text-3xl font-semibold tabular-nums">{pendentes}</p>
          <p className="text-sm text-texto-2">
            {pendentes ? `cartões · ~${minutosRevisao(pendentes)} min` : d.revisoesHoje ? `${d.revisoesHoje} revisados hoje ✓` : "nada para hoje"}
          </p>
        </Link>
        <div className="cartao-ui">
          <p className="rotulo">Sabedoria do dia</p>
          <p className="text-lg font-semibold">{sabedoria.referencia}</p>
          <a
            className="text-sm text-destaque underline"
            href={`https://www.bibliaonline.com.br/acf/${sabedoria.livro === "Provérbios" ? "pv" : "sl"}/${sabedoria.capitulos[0]}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir texto
          </a>
        </div>
      </section>

      {atual ? (
        <section className="cartao-ui space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="rotulo">
              Trimestre T{atual.ordem} · {atual.periodo}
            </p>
            {proximo && <p className="text-xs text-texto-2">Próximo: {proximo.nucleo_titulo}</p>}
          </div>
          <Bloco titulo="Núcleo (estudo profundo diário)" texto={atual.nucleo_titulo} cor={pilarDoTema(atual.tema_nucleo_id)?.cor} />
          <Bloco titulo="Trilha paralela (2–3×/semana)" texto={atual.paralela_titulo} cor={pilarDoTema(atual.tema_paralelo_id)?.cor} />
          {atual.idiomas_foco && <Bloco titulo="Idiomas" texto={atual.idiomas_foco} cor={pilares.find((p) => p.numero === 8)?.cor} />}
        </section>
      ) : (
        <section className="cartao-ui text-sm text-texto-2">Nenhum trimestre ativo para hoje. Ajuste o cronograma na Trilha.</section>
      )}

      <section className="cartao-ui">
        <p className="rotulo mb-2">Checklist da rotina</p>
        <ul className="divide-y divide-borda">
          {resumo.itens.map((i) => {
            const automatico = i.id === "revisao" || i.id === "diario";
            const destino = i.id === "revisao" ? "/revisar" : i.id === "diario" ? "/diario" : null;
            return (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <button
                  aria-label={i.feito ? "Desmarcar" : "Marcar como feito"}
                  disabled={automatico && !checklist[i.id] && i.feito}
                  onClick={() => alternar(i.id)}
                  className={`grid size-6 shrink-0 place-items-center rounded-md border text-xs ${
                    i.feito ? "border-sucesso bg-sucesso text-white" : "border-borda"
                  }`}
                >
                  {i.feito ? "✓" : ""}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${i.feito ? "text-texto-2 line-through" : ""}`}>
                    {destino ? (
                      <Link href={destino} className="underline decoration-borda underline-offset-2">
                        {i.atividade}
                      </Link>
                    ) : (
                      i.atividade
                    )}
                  </p>
                  <p className="text-xs text-texto-2">
                    {i.momento} · {i.minutos} min
                    {i.acoplado && ` · acoplado${i.opcional ? ", opcional" : ""} (fora da meta)`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Bloco({ titulo, texto, cor }: { titulo: string; texto: string; cor?: string | null }) {
  return (
    <div className="border-l-4 pl-3" style={{ borderColor: cor ?? "var(--borda)" }}>
      <p className="text-xs text-texto-2">{titulo}</p>
      <p className="font-medium">{texto}</p>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-superficie-2" />
      ))}
    </div>
  );
}
