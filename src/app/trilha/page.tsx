"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { IconeCheck } from "@/components/icones";
import { Cabecalho, CaixaErro, corPilar, Esqueleto, LinhaLink, Ponto } from "@/components/ui";
import { dataLocal, diasEntre } from "@/lib/datas";
import { dadosTrilha } from "@/lib/db";
import { trimestreAtual } from "@/lib/hoje";
import { listarAulas } from "@/lib/ia";

type Dados = Awaited<ReturnType<typeof dadosTrilha>> & { aulas: Awaited<ReturnType<typeof listarAulas>> };

export default function Trilha() {
  const { pilares, temas } = useApp();
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([dadosTrilha(), listarAulas(200).catch(() => [])]).then(([t, aulas]) => setD({ ...t, aulas }), (e) => setErro(e.message));
  }, []);
  if (erro) return <CaixaErro mensagem={erro} />;
  if (!d) return <Esqueleto />;

  const hoje = dataLocal();
  const { atual } = trimestreAtual(d.trimestres, hoje);
  const ciclo = d.ciclos[0];
  const ingles = d.idiomas.find((i) => i.nome === "Inglês");
  const pilarDoTema = (id: string | null) => pilares.find((p) => p.id === temas.find((t) => t.id === id)?.pilar_id);
  const semanas = atual ? Math.ceil((diasEntre(atual.data_inicio, atual.data_fim) + 1) / 7) : 0;
  const semana = atual ? Math.min(semanas, Math.floor(diasEntre(atual.data_inicio, hoje) / 7) + 1) : 0;

  function renderPasso(passo: "nucleo" | "paralela") {
    if (!atual) return null;
    const aulas = d!.aulas.filter((a) => a.trimestre_id === atual.id && a.passo === passo).reverse();
    const feitas = aulas.filter((a) => a.estudada_em);
    const andamento = aulas.find((a) => !a.estudada_em);
    const temaId = passo === "nucleo" ? atual.tema_nucleo_id : atual.tema_paralelo_id;
    const titulo = passo === "nucleo" ? atual.nucleo_titulo : atual.paralela_titulo;
    if (passo === "paralela") {
      return (
        <Link href="/aula/nova/paralela" className="cartao-ui flex items-center gap-3.5">
          <Ponto cor={corPilar(pilarDoTema(temaId)?.numero)} tamanho={10} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-texto-2">Paralela · ter, qui e sáb</span>
            <span className="block text-[17px] leading-snug font-semibold">{titulo}</span>
            <span className="block text-[13px] text-texto-2">
              {feitas.length} {feitas.length === 1 ? "aula concluída" : "aulas concluídas"}
              {andamento ? " · 1 em andamento" : ""}
            </span>
          </span>
        </Link>
      );
    }
    return (
      <section aria-labelledby="nucleo" className="cartao-destaque flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <span className="chip">
            <Ponto cor={corPilar(pilarDoTema(temaId)?.numero)} />
            Núcleo · todo dia
          </span>
          <span className="text-[13px] text-texto-2">
            {feitas.length} {feitas.length === 1 ? "aula" : "aulas"}
          </span>
        </div>
        <div>
          <h2 id="nucleo" className="titulo-cartao">
            {titulo}
          </h2>
          <div className="mt-3 h-1 overflow-hidden rounded-sm bg-superficie-2">
            <span className="block h-full bg-texto" style={{ width: `${Math.round((semana / Math.max(1, semanas)) * 100)}%` }} />
          </div>
        </div>
        <ol className="flex flex-col gap-0.5">
          {feitas.slice(-4).map((a) => (
            <li key={a.id}>
              <Link href={`/aula/${a.id}`} className="flex min-h-11 items-center gap-3 text-[15px] text-texto-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-texto text-fundo">
                  <IconeCheck tamanho={12} />
                </span>
                <span className="truncate">{a.titulo}</span>
              </Link>
            </li>
          ))}
          <li>
            <Link href="/aula/nova/nucleo" className="flex min-h-11 items-center gap-3 text-[15px] font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-texto">
                <span className="h-2 w-2 rounded-full bg-texto" />
              </span>
              <span className="flex-1 truncate">{andamento?.titulo ?? `Próxima aula: ${temas.find((t) => t.id === temaId)?.nome ?? titulo}`}</span>
              <span className="text-[13px] font-medium text-texto-2">Hoje</span>
            </Link>
          </li>
        </ol>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho sobre={atual ? `Ciclo ${ciclo?.numero ?? 1} · T${atual.ordem} · ${atual.periodo} · semana ${semana} de ${semanas}` : "Sem trimestre ativo hoje"} titulo="Trilha" />
      {renderPasso("nucleo")}
      {renderPasso("paralela")}
      <nav aria-label="Mais da trilha" className="cartao-ui px-4 py-0">
        <LinhaLink href="/trilha/ciclo" titulo={`Ciclo completo · ${d.trimestres.length} trimestres`} />
        <LinhaLink href="/trilha/pilares" titulo="Os 8 pilares e a base física" />
        <LinhaLink href="/trilha/idiomas" titulo="Idiomas" detalhe={ingles ? `inglês ${ingles.nivel_atual} rumo ao ${ingles.meta}` : undefined} />
      </nav>
    </div>
  );
}
