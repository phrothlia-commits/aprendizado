"use client";

import { useEffect, useState } from "react";
import { IconeCheck } from "@/components/icones";
import { CabecalhoVoltar, CaixaErro, Esqueleto } from "@/components/ui";
import { dadosTrilha } from "@/lib/db";
import type { Idioma } from "@/lib/tipos";

const STATUS: Record<Idioma["status"], string> = { ativo: "ativo", passivo: "passivo", fila: "na fila" };

export default function Idiomas() {
  const [idiomas, setIdiomas] = useState<Idioma[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    dadosTrilha().then((d) => setIdiomas(d.idiomas), (e) => setErro(e.message));
  }, []);
  return (
    <div className="flex flex-col gap-5">
      <CabecalhoVoltar voltar="/trilha" sobre="Trilha" titulo="Idiomas" />
      <p className="text-sm text-texto-2">Estudados em sequência, nunca dois novos em paralelo.</p>
      {erro && <CaixaErro mensagem={erro} />}
      {!idiomas && !erro && <Esqueleto />}
      {idiomas?.map((i) => (
        <section key={i.id} className="cartao-ui flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="titulo-cartao text-[22px]">{i.nome}</h2>
            <span className="text-sm">
              <span className="font-semibold">{i.nivel_atual}</span> → {i.meta} · <span className="text-texto-2">{STATUS[i.status]}</span>
            </span>
          </div>
          {i.motivo && <p className="text-sm leading-relaxed text-texto-2">{i.motivo}</p>}
          <p className="text-xs text-texto-2">{i.horas_acumuladas} h acumuladas</p>
          {i.marcos.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-sm">
              {i.marcos.map((m) => (
                <li key={m.titulo} className={`flex items-center gap-2 ${m.atingido_em ? "text-ok" : ""}`}>
                  {m.atingido_em ? <IconeCheck /> : <span className="h-3 w-3 rounded-full border border-borda" />}
                  {m.titulo}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
