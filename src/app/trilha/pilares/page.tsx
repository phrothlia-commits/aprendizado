"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { IconeCheck } from "@/components/icones";
import { CabecalhoVoltar, corPilar, Ponto } from "@/components/ui";
import { atualizarTema } from "@/lib/db";
import { NIVEIS, STATUS_TEMA, type Nivel, type StatusTema, type Tema } from "@/lib/tipos";

const PRIORIDADE: Record<string, string> = { A: "A · retorno direto", B: "B · base estratégica", C: "C · paixão e profundidade", continua: "contínua" };

export default function Pilares() {
  const { pilares, temas, recarregar } = useApp();
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  return (
    <div className="flex flex-col gap-5">
      <CabecalhoVoltar voltar="/trilha" sobre="Trilha" titulo="Os 8 pilares" />
      <p className="text-sm leading-relaxed text-texto-2">Um tema só avança de nível quando você consegue explicá-lo sem consultar (critério Feynman). Use o Tutor Feynman em cada tema.</p>
      {pilares.map((p) => {
        const ts = temas.filter((t) => t.pilar_id === p.id);
        const aberto = abertos[p.id];
        return (
          <section key={p.id} className="cartao-ui p-0">
            <button className="flex w-full cursor-pointer items-center gap-3 px-[18px] py-4 text-left" aria-expanded={!!aberto} onClick={() => setAbertos({ ...abertos, [p.id]: !aberto })}>
              <Ponto cor={corPilar(p.numero)} tamanho={10} />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold">
                  {p.numero ? `${p.numero}. ` : ""}
                  {p.nome}
                </span>
                <span className="block text-xs text-texto-2">Prioridade {PRIORIDADE[p.prioridade]}</span>
              </span>
              <span className="text-xs text-texto-2">
                {ts.filter((t) => t.status === "ativo").length} ativo · {ts.length} temas
              </span>
            </button>
            {aberto && (
              <ul className="border-t border-borda px-[18px]">
                {ts.map((t) => (
                  <LinhaTema key={t.id} tema={t} onMudou={recarregar} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function LinhaTema({ tema, onMudou }: { tema: Tema; onMudou: () => Promise<void> }) {
  const idx = NIVEIS.findIndex((n) => n.valor === tema.nivel);
  const proximo = NIVEIS[idx + 1];
  async function salvar(patch: Parameters<typeof atualizarTema>[1]) {
    await atualizarTema(tema.id, patch);
    await onMudou();
  }
  return (
    <li className="flex flex-col gap-2.5 border-b border-borda py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-semibold">{tema.nome}</p>
        <div className="flex items-center gap-2">
          <select aria-label="Status do tema" className="campo w-auto py-1.5 text-xs" value={tema.status} onChange={(e) => salvar({ status: e.target.value as StatusTema })}>
            {(Object.keys(STATUS_TEMA) as StatusTema[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_TEMA[s]}
              </option>
            ))}
          </select>
          <span className="chip">{NIVEIS[idx].rotulo}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`flex items-center gap-1 text-xs ${tema.feynman_ok ? "font-semibold text-ok" : "text-texto-2"}`}>
          {tema.feynman_ok && <IconeCheck tamanho={12} />}
          {tema.feynman_ok ? "Critério Feynman atingido" : "Critério Feynman pendente"}
        </span>
        <Link href={`/feynman/${tema.id}`} className="botao h-9 rounded-full bg-superficie-2 px-3 text-[13px]">
          Explicar com minhas palavras
        </Link>
        {proximo && (
          <button
            className="botao h-9 rounded-full bg-superficie-2 px-3 text-[13px]"
            disabled={!tema.feynman_ok}
            title={tema.feynman_ok ? "" : "Só avança quando você consegue explicar sem consultar"}
            onClick={() => salvar({ nivel: proximo.valor as Nivel, feynman_ok: false, status: "fila" })}
          >
            Avançar para {proximo.rotulo.toLowerCase()}
          </button>
        )}
      </div>
    </li>
  );
}
