"use client";

import { useCallback, useEffect, useState } from "react";
import { CabecalhoVoltar, CaixaErro, corPilar, Esqueleto, Secao } from "@/components/ui";
import { dataLocal, deDataLocal } from "@/lib/datas";
import { habitosDaSemana, salvarHabito } from "@/lib/db";
import type { Habito } from "@/lib/tipos";

const META_SEMANAL = 150;
const TIPOS = ["Caminhada", "Corrida", "Bicicleta", "Natação", "Dança", "Esporte", "Outro aeróbico"];

export default function Habitos() {
  const hoje = dataLocal();
  const [semana, setSemana] = useState<Habito[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sono, setSono] = useState("");
  const [minutos, setMinutos] = useState("");
  const [tipo, setTipo] = useState("");
  const [novidade, setNovidade] = useState("");
  const [salvo, setSalvo] = useState(false);

  const aplicar = useCallback(
    (s: Habito[]) => {
      setSemana(s);
      const h = s.find((x) => x.data === hoje);
      setSono(h?.horas_sono != null ? String(h.horas_sono).replace(".", ",") : "");
      setMinutos(h?.minutos_exercicio ? String(h.minutos_exercicio) : "");
      setTipo(h?.tipo_exercicio ?? "");
      setNovidade(s.find((x) => x.novidade)?.novidade ?? "");
    },
    [hoje],
  );
  const carregar = useCallback(() => {
    habitosDaSemana().then(aplicar, (e) => setErro((e as Error).message));
  }, [aplicar]);
  useEffect(carregar, [carregar]);

  if (erro) return <CaixaErro mensagem={erro} />;
  if (!semana) return <Esqueleto />;

  const totalSemana = semana.reduce((s, h) => s + (h.minutos_exercicio ?? 0), 0);
  const sessoes = semana.filter((h) => (h.minutos_exercicio ?? 0) >= 10).length;
  const sonoMedio = (() => {
    const v = semana.map((h) => h.horas_sono).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + Number(b), 0) / v.length : null;
  })();

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const horas = sono.trim() ? Number(sono.replace(",", ".")) : null;
    const min = minutos.trim() ? Math.round(Number(minutos)) : null;
    // A novidade é da semana: fica no registro de hoje e aparece na semana toda.
    await salvarHabito(hoje, {
      horas_sono: horas !== null && Number.isFinite(horas) ? Math.min(24, Math.max(0, horas)) : null,
      minutos_exercicio: min !== null && Number.isFinite(min) ? Math.min(600, Math.max(0, min)) : null,
      tipo_exercicio: tipo || null,
      novidade: novidade.trim() || null,
    });
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2000);
    carregar();
  }

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoVoltar voltar="/voce" sobre="Base física" titulo="Corpo e sono" />

      <section className="cartao-ui flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="rotulo">Exercício aeróbico na semana</h2>
          <span className="text-[13px] text-texto-2">meta {META_SEMANAL} min</span>
        </div>
        <div className="num font-serif text-[40px] leading-none font-medium">
          {totalSemana}
          <span className="font-sans text-base font-medium text-texto-2"> / {META_SEMANAL} min</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-sm bg-superficie-2">
          <span className="block h-full transition-all" style={{ width: `${Math.min(100, (totalSemana / META_SEMANAL) * 100)}%`, background: corPilar(0) }} />
        </div>
        <p className="text-[13px] text-texto-2">
          {sessoes} {sessoes === 1 ? "sessão" : "sessões"} (meta: 3 a 5){sonoMedio !== null && ` · sono médio ${sonoMedio.toFixed(1).replace(".", ",")} h`}
        </p>
      </section>

      <form onSubmit={salvar} className="flex flex-col gap-6">
        <Secao titulo="Hoje">
          <div className="cartao-ui flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
              Horas de sono (meta: 7 a 9)
              <input className="campo" inputMode="decimal" placeholder="7,5" value={sono} onChange={(e) => setSono(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
                Exercício (min)
                <input className="campo" inputMode="numeric" placeholder="30" value={minutos} onChange={(e) => setMinutos(e.target.value.replace(/\D/g, ""))} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
                Tipo
                <select className="campo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="">—</option>
                  {TIPOS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </Secao>
        <Secao titulo="Novidade da semana">
          <div className="cartao-ui flex flex-col gap-2">
            <label htmlFor="novidade" className="text-[13px] text-texto-2">
              Uma experiência nova ou um desafio de iniciante
            </label>
            <input id="novidade" className="campo" placeholder="Ex.: primeira aula de improviso" value={novidade} onChange={(e) => setNovidade(e.target.value)} />
          </div>
        </Secao>
        <div className="flex items-center gap-3">
          <button className="botao-primario flex-1">Salvar</button>
          {salvo && <span className="text-sm font-semibold text-ok">Salvo</span>}
        </div>
      </form>

      <Secao titulo="Semana">
        <ul className="cartao-ui flex flex-col p-0">
          {semana.length === 0 && <li className="px-4 py-3 text-sm text-texto-2">Nenhum registro nesta semana.</li>}
          {semana.map((h) => (
            <li key={h.id} className="flex justify-between gap-3 border-b border-borda px-4 py-3 text-sm last:border-b-0">
              <span className="font-semibold">{deDataLocal(h.data).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" })}</span>
              <span className="text-texto-2">
                {[h.horas_sono != null ? `${String(h.horas_sono).replace(".", ",")} h de sono` : null, h.minutos_exercicio ? `${h.minutos_exercicio} min${h.tipo_exercicio ? ` de ${h.tipo_exercicio.toLowerCase()}` : ""}` : null].filter(Boolean).join(" · ") || "—"}
              </span>
            </li>
          ))}
        </ul>
      </Secao>
    </div>
  );
}
