"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Aviso, CaixaErro, TopoFluxo } from "@/components/ui";
import { dataLocal } from "@/lib/datas";
import { trimestreAtual } from "@/lib/hoje";
import { gerarAula, listarAulas, statusIA, type ProgressoAula, type StatusIA } from "@/lib/ia";
import { supabase } from "@/lib/supabase";
import type { Trimestre } from "@/lib/tipos";

const ETAPAS: { chave: ProgressoAula["etapa"][]; texto: string }[] = [
  { chave: ["pendente", "pesquisa"], texto: "Pesquisando fontes" },
  { chave: ["verificacao"], texto: "Verificando links" },
  { chave: ["composicao"], texto: "Escrevendo a aula" },
  { chave: ["conferencia"], texto: "Conferindo citações e cartões" },
];

/** Id de idempotência da geração: sobrevive à recarga da página (sessionStorage). */
function idDaGeracao(chave: string, novo: boolean): string {
  try {
    const salvo = sessionStorage.getItem(chave);
    if (salvo && !novo) return salvo;
    const id = crypto.randomUUID();
    sessionStorage.setItem(chave, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Abre a aula em andamento do passo ou gera uma nova, mostrando o progresso real. */
export default function NovaAula() {
  const { passo } = useParams<{ passo: string }>();
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<ProgressoAula>({ etapa: "pendente" });
  const [tentativa, setTentativa] = useState(0);
  const [novasFontes, setNovasFontes] = useState(false);
  const [status, setStatus] = useState<StatusIA | null>(null);
  const iniciado = useRef(-1);

  useEffect(() => {
    if (iniciado.current === tentativa) return;
    iniciado.current = tentativa;
    const p = passo === "paralela" ? "paralela" : "nucleo";
    (async () => {
      try {
        const { data, error } = await supabase().from("trimestres").select("*").order("data_inicio");
        if (error) throw new Error(error.message);
        const { atual } = trimestreAtual((data ?? []) as Trimestre[], dataLocal());
        if (!atual) throw new Error("Não há trimestre ativo hoje. Ajuste o cronograma na Trilha.");
        // Reabrir uma aula já gerada nunca chama a API.
        const andamento = (await listarAulas(40)).find((a) => a.trimestre_id === atual.id && a.passo === p && !a.estudada_em);
        if (andamento) return router.replace(`/aula/${andamento.id}`);
        const s = await statusIA();
        setStatus(s);
        if (!s?.configurada) throw new Error("A IA ainda não está configurada: cadastre a variável ANTHROPIC_API_KEY na Vercel e faça um novo deploy.");
        const chave = `geracao:${atual.id}:${p}`;
        const { id } = await gerarAula(
          { trimestreId: atual.id, passo: p, geracaoId: idDaGeracao(chave, tentativa > 0), novasFontes: tentativa > 0 && novasFontes },
          setProgresso,
        );
        try {
          sessionStorage.removeItem(chave);
        } catch {}
        router.replace(`/aula/${id}`);
      } catch (e) {
        setErro((e as Error).message);
      }
    })();
  }, [passo, router, tentativa, novasFontes]);

  const atual = Math.max(
    0,
    ETAPAS.findIndex((e) => e.chave.includes(progresso.etapa)),
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <TopoFluxo href="/" titulo={passo === "paralela" ? "Trilha paralela" : "Aula de hoje"} />
      <main className="flex flex-1 flex-col justify-center gap-6 px-6 pb-16">
        {status?.alerta === "perto_do_teto" && (
          <Aviso>
            O gasto com IA deste mês já passou de 80% do teto (US$ {status.custo_mes.toFixed(2)} de US$ {status.teto_mensal.toFixed(2)}).
          </Aviso>
        )}
        {erro ? (
          <CaixaErro
            mensagem={erro}
            acao={
              <div className="flex flex-col gap-3">
                <p className="text-sm text-texto-2">Ao tentar de novo, o que já foi feito (fontes, rascunho) é aproveitado e não é cobrado outra vez.</p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={novasFontes} onChange={(e) => setNovasFontes(e.target.checked)} />
                  Buscar novas fontes (ignora as fontes guardadas do tema)
                </label>
                <div className="flex gap-2">
                  <button
                    className="botao-primario flex-1"
                    onClick={() => {
                      setErro(null);
                      setProgresso({ etapa: "pendente" });
                      setTentativa((t) => t + 1);
                    }}
                  >
                    Tentar de novo
                  </button>
                  <Link href="/" className="botao-secundario flex-1">
                    Voltar
                  </Link>
                </div>
              </div>
            }
          />
        ) : (
          <div aria-live="polite" className="flex flex-col gap-5">
            <div className="h-1 overflow-hidden rounded-sm bg-superficie-2">
              <span className="block h-full bg-texto transition-all duration-700" style={{ width: `${((atual + 1) / ETAPAS.length) * 100}%` }} />
            </div>
            <h1 className="titulo-cartao">Preparando sua aula</h1>
            <ol className="flex flex-col gap-2.5 text-[15px]">
              {ETAPAS.map((e, i) => (
                <li key={e.texto} className={i < atual ? "text-texto-2 line-through decoration-borda" : i === atual ? "font-semibold" : "text-texto-3"}>
                  {e.texto}
                  {i === atual && "…"}
                  {i === atual && progresso.reaproveitado && <span className="font-normal text-texto-2"> (fontes guardadas do tema)</span>}
                  {i === atual && progresso.caracteres ? <span className="num font-normal text-texto-2"> · {Math.round(progresso.caracteres / 6)} palavras</span> : null}
                </li>
              ))}
            </ol>
            <p className="text-sm leading-relaxed text-texto-2">Leva de 1 a 2 minutos. A aula usa só fontes legais e cada link é verificado antes de aparecer. Se a conexão cair, volte a esta tela: o que já foi feito é aproveitado.</p>
          </div>
        )}
      </main>
    </div>
  );
}
