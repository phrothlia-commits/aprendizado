"use client";

import { useCallback, useEffect, useState } from "react";
import { IconeAvancar } from "@/components/icones";
import { CabecalhoVoltar, CaixaErro, Esqueleto } from "@/components/ui";
import { dataLocal } from "@/lib/datas";
import { dadosTrilha, salvarNotasTrimestre, trocarTrimestres } from "@/lib/db";
import type { Trimestre } from "@/lib/tipos";

export default function Ciclo() {
  const [d, setD] = useState<Awaited<ReturnType<typeof dadosTrilha>> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => {
    dadosTrilha().then(setD, (e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);
  if (erro) return <CaixaErro mensagem={erro} />;
  if (!d) return <Esqueleto />;
  const hoje = dataLocal();
  const c = d.ciclos[0];

  async function mover(lista: Trimestre[], i: number, dir: -1 | 1) {
    await trocarTrimestres(lista[i], lista[i + dir]);
    carregar();
  }

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoVoltar voltar="/trilha" sobre={c ? `Ciclo ${c.numero} · ${c.nivel}` : "Trilha"} titulo="Ciclo completo" />
      <p className="text-sm leading-relaxed text-texto-2">Ao fim de cada trimestre, revise a fila e reordene os próximos núcleos. Um tema urgente sobe; o planejado desce uma posição. Nenhum tema é removido.</p>
      <ol className="flex flex-col gap-2.5">
        {d.trimestres.map((t, i, lista) => {
          const passado = t.data_fim < hoje;
          const atual = t.data_inicio <= hoje && hoje <= t.data_fim;
          const podeSubir = !passado && !atual && i > 0 && lista[i - 1].data_inicio > hoje;
          const podeDescer = !passado && !atual && i < lista.length - 1;
          return (
            <li key={t.id} className={`cartao-ui flex flex-col gap-3 ${atual ? "border-texto" : ""} ${passado ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-texto-2">
                    T{t.ordem} · {t.periodo} {atual && <span className="font-semibold text-texto">· atual</span>}
                  </p>
                  <p className="mt-0.5 text-[17px] leading-snug font-semibold">{t.nucleo_titulo}</p>
                  <p className="mt-0.5 text-sm text-texto-2">Paralela: {t.paralela_titulo}</p>
                  {t.idiomas_foco && <p className="text-sm text-texto-2">Idiomas: {t.idiomas_foco}</p>}
                </div>
                {(podeSubir || podeDescer) && (
                  <div className="flex flex-col gap-1.5">
                    <button className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-borda disabled:opacity-30" disabled={!podeSubir} onClick={() => mover(lista, i, -1)} aria-label="Antecipar">
                      <IconeAvancar className="-rotate-90" />
                    </button>
                    <button className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-borda disabled:opacity-30" disabled={!podeDescer} onClick={() => mover(lista, i, 1)} aria-label="Adiar">
                      <IconeAvancar className="rotate-90" />
                    </button>
                  </div>
                )}
              </div>
              {(atual || passado) && <Notas t={t} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Notas({ t }: { t: Trimestre }) {
  const [texto, setTexto] = useState(t.notas_revisao ?? "");
  const [salvo, setSalvo] = useState(true);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="rotulo">Revisão do trimestre</span>
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
    </label>
  );
}
