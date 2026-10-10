"use client";

import { useEffect, useState } from "react";
import { Cabecalho, CaixaErro, corPilar, Esqueleto, LinhaLink } from "@/components/ui";
import { deDataLocal } from "@/lib/datas";
import { dadosVoce } from "@/lib/db";
import { itensDoDia } from "@/lib/hoje";

const LETRAS = ["S", "T", "Q", "Q", "S", "S", "D"];
const META_CORPO = 150;

function horas(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
}

export default function Voce() {
  const [d, setD] = useState<Awaited<ReturnType<typeof dadosVoce>> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    dadosVoce().then(setD, (e) => setErro(e.message));
  }, []);
  if (erro) return <CaixaErro mensagem={erro} />;
  if (!d) return <Esqueleto />;

  // Meta da semana: 60 min nos dias comuns e 90 nos dias de trilha paralela.
  const metaSemana = d.dias.reduce((s, x) => s + itensDoDia("padrao", x.data).filter((i) => !i.acoplado).reduce((a, i) => a + i.minutos, 0), 0);
  const maxBarra = Math.max(90, ...d.dias.map((x) => x.minutos ?? 0));
  const descricao = d.dias
    .filter((x) => x.minutos !== null)
    .map((x) => `${deDataLocal(x.data).toLocaleDateString("pt-BR", { weekday: "long" })} ${x.minutos} min`)
    .join(", ");

  return (
    <div className="flex flex-col gap-6">
      <Cabecalho sobre="Seu progresso" titulo="Você" />

      <section aria-labelledby="semana" className="cartao-ui flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="semana" className="rotulo">
            Esta semana
          </h2>
          <span className="text-[13px] text-texto-2">meta {horas(metaSemana)}</span>
        </div>
        <div className="num font-serif text-[40px] leading-none font-medium tracking-[-0.02em]">{horas(d.totalSemana)}</div>
        <div role="img" aria-label={`Minutos por dia: ${descricao || "sem registros"}`} className="grid h-[96px] grid-cols-7 items-end gap-2">
          {d.dias.map((x, i) => (
            <div key={x.data} className="flex h-full flex-col items-center justify-end gap-1.5">
              <span
                className="w-full rounded-md"
                style={{
                  height: x.minutos === null ? 4 : Math.max(4, Math.round((x.minutos / maxBarra) * 72)),
                  background: x.minutos === null ? "var(--superficie-2)" : x.minutos === 0 ? "var(--borda)" : "var(--texto)",
                }}
              />
              <span className={`text-[11px] ${x.hoje ? "font-bold" : "font-medium text-texto-2"}`}>{LETRAS[i]}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-2.5">
        <div className="cartao-ui flex flex-col gap-1 rounded-2xl p-4">
          <div className="text-xs font-semibold text-texto-2">Retenção</div>
          <div className="num font-serif text-[30px] leading-tight font-medium">{d.retencao === null ? "–" : `${Math.round(d.retencao * 100)}%`}</div>
          <div className="text-xs text-texto-2">{d.retencao === null ? "sem revisões ainda" : "acertos nas revisões, 30 dias"}</div>
        </div>
        <div className="cartao-ui flex flex-col gap-1 rounded-2xl p-4">
          <div className="text-xs font-semibold text-texto-2">Corpo</div>
          <div className="num font-serif text-[30px] leading-tight font-medium">
            {d.exercicioSemana}
            <span className="font-sans text-sm font-medium text-texto-2"> / {META_CORPO} min</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-sm bg-superficie-2">
            <span className="block h-full" style={{ width: `${Math.min(100, (d.exercicioSemana / META_CORPO) * 100)}%`, background: corPilar(0) }} />
          </div>
        </div>
      </section>

      <nav aria-label="Seções" className="cartao-ui px-4 py-0">
        <LinhaLink href="/diario" titulo="Diário" detalhe={`${d.totalDiarios} ${d.totalDiarios === 1 ? "entrada" : "entradas"}`} />
        <LinhaLink href="/cartoes" titulo="Cartões" detalhe={`${d.totalCartoes} · ${d.cartoesHoje} para hoje`} />
        <LinhaLink href="/voce/aulas" titulo="Aulas salvas" detalhe={String(d.totalAulas)} />
        <LinhaLink href="/habitos" titulo="Corpo e sono" detalhe="registrar hoje" />
        <LinhaLink href="/voce/config" titulo="Configurações" detalhe="IA, revisão, exportar" />
      </nav>
    </div>
  );
}
