"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CaixaErro, TopoFluxo } from "@/components/ui";
import { dataLocal } from "@/lib/datas";
import { trimestreAtual } from "@/lib/hoje";
import { gerarAula, iaConfigurada, listarAulas } from "@/lib/ia";
import { supabase } from "@/lib/supabase";
import type { Trimestre } from "@/lib/tipos";

const ETAPAS = ["Buscando fontes legais", "Verificando cada link", "Lendo trechos da sua biblioteca", "Escrevendo a aula", "Preparando os cartões"];

/** Abre a aula em andamento do passo ou gera uma nova (1 a 2 minutos). */
export default function NovaAula() {
  const { passo } = useParams<{ passo: string }>();
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState(0);
  const [tentativa, setTentativa] = useState(0);
  const iniciado = useRef(-1);

  useEffect(() => {
    if (iniciado.current === tentativa) return;
    iniciado.current = tentativa;
    const p = passo === "paralela" ? "paralela" : "nucleo";
    const relogio = setInterval(() => setEtapa((e) => Math.min(e + 1, ETAPAS.length - 1)), 14000);
    (async () => {
      try {
        const { data, error } = await supabase().from("trimestres").select("*").order("data_inicio");
        if (error) throw new Error(error.message);
        const { atual } = trimestreAtual((data ?? []) as Trimestre[], dataLocal());
        if (!atual) throw new Error("Não há trimestre ativo hoje. Ajuste o cronograma na Trilha.");
        const andamento = (await listarAulas(40)).find((a) => a.trimestre_id === atual.id && a.passo === p && !a.estudada_em);
        if (andamento) return router.replace(`/aula/${andamento.id}`);
        if (!(await iaConfigurada())) {
          throw new Error("A IA ainda não está configurada: cadastre a variável ANTHROPIC_API_KEY na Vercel e faça um novo deploy.");
        }
        const { id } = await gerarAula(atual.id, p);
        router.replace(`/aula/${id}`);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        clearInterval(relogio);
      }
    })();
    return () => clearInterval(relogio);
  }, [passo, router, tentativa]);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopoFluxo href="/" titulo={passo === "paralela" ? "Trilha paralela" : "Aula de hoje"} />
      <main className="flex flex-1 flex-col justify-center gap-6 px-6 pb-16">
        {erro ? (
          <CaixaErro
            mensagem={erro}
            acao={
              <div className="flex gap-2">
                <button
                  className="botao-primario flex-1"
                  onClick={() => {
                    setErro(null);
                    setEtapa(0);
                    setTentativa((t) => t + 1);
                  }}
                >
                  Tentar de novo
                </button>
                <Link href="/" className="botao-secundario flex-1">
                  Voltar
                </Link>
              </div>
            }
          />
        ) : (
          <div aria-live="polite" className="flex flex-col gap-5">
            <div className="h-1 overflow-hidden rounded-sm bg-superficie-2">
              <span className="block h-full animate-pulse bg-texto transition-all duration-1000" style={{ width: `${((etapa + 1) / ETAPAS.length) * 100}%` }} />
            </div>
            <h1 className="titulo-cartao">Preparando sua aula</h1>
            <ol className="flex flex-col gap-2.5 text-[15px]">
              {ETAPAS.map((e, i) => (
                <li key={e} className={i < etapa ? "text-texto-2 line-through decoration-borda" : i === etapa ? "font-semibold" : "text-texto-3"}>
                  {e}
                  {i === etapa && "…"}
                </li>
              ))}
            </ol>
            <p className="text-sm leading-relaxed text-texto-2">Leva de 1 a 2 minutos. A aula usa só fontes legais e cada link é verificado antes de aparecer.</p>
          </div>
        )}
      </main>
    </div>
  );
}
