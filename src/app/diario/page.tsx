"use client";

import { useEffect, useState } from "react";
import { CabecalhoVoltar } from "@/components/ui";
import { dataLocal, formatarData } from "@/lib/datas";
import { buscarDiarios, salvarDiario } from "@/lib/db";
import type { Diario } from "@/lib/tipos";

export default function DiarioPagina() {
  const hoje = dataLocal();
  const [historico, setHistorico] = useState<Diario[] | null>(null);
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState(["", "", ""]);
  const [tags, setTags] = useState("");
  const [estado, setEstado] = useState<"" | "salvando" | "salvo">("");
  const [carregouHoje, setCarregouHoje] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      buscarDiarios(busca).then((l) => {
        setHistorico(l);
        if (!carregouHoje && !busca) {
          const d = l.find((x) => x.data === hoje);
          if (d) {
            setItens([d.aprendizado_1 ?? "", d.aprendizado_2 ?? "", d.aprendizado_3 ?? ""]);
            setTags(d.tags.join("; "));
          }
          setCarregouHoje(true);
        }
      });
    }, 250);
    return () => clearTimeout(t);
  }, [busca, hoje, carregouHoje]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("salvando");
    const d = await salvarDiario({
      data: hoje,
      aprendizado_1: itens[0].trim() || null,
      aprendizado_2: itens[1].trim() || null,
      aprendizado_3: itens[2].trim() || null,
      tags: tags.split(/[;,]/).map((t) => t.trim().toLowerCase()).filter(Boolean),
    });
    setHistorico((h) => [d, ...(h ?? []).filter((x) => x.data !== hoje)]);
    setEstado("salvo");
  }

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoVoltar voltar="/" sobre="Refletir" titulo="Diário" />
      <form onSubmit={salvar} className="cartao-ui flex flex-col gap-3">
        <div>
          <p className="rotulo">3 aprendizados de hoje</p>
          <p className="text-xs text-texto-2">Escreva de memória, sem consultar. É prática de recuperação.</p>
        </div>
        {itens.map((v, i) => (
          <textarea
            key={i}
            className="campo min-h-16"
            placeholder={`Aprendizado ${i + 1}`}
            value={v}
            onChange={(e) => {
              const n = [...itens];
              n[i] = e.target.value;
              setItens(n);
              setEstado("");
            }}
          />
        ))}
        <input className="campo" placeholder="tags; opcionais" value={tags} onChange={(e) => (setTags(e.target.value), setEstado(""))} />
        <div className="flex items-center gap-3">
          <button className="botao-primario" disabled={estado === "salvando" || !itens.some((x) => x.trim())}>
            Salvar
          </button>
          {estado === "salvo" && <span className="text-sm font-semibold text-ok">Salvo ✓</span>}
        </div>
      </form>

      <section className="flex flex-col gap-3">
        <input className="campo" placeholder="Buscar no histórico" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {historico?.length === 0 && <p className="text-sm text-texto-2">Nada encontrado.</p>}
        <ul className="flex flex-col gap-2">
          {historico?.map((d) => (
            <li key={d.id} className="cartao-ui">
              <p className="text-xs text-texto-2">{formatarData(d.data)}</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
                {[d.aprendizado_1, d.aprendizado_2, d.aprendizado_3].filter(Boolean).map((a, i) => (
                  <li key={i} className="whitespace-pre-wrap">
                    {a}
                  </li>
                ))}
              </ol>
              {d.tags.length > 0 && <p className="mt-2 text-[11px] text-texto-2">{d.tags.join(" · ")}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
