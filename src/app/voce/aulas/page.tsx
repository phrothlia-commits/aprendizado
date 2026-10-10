"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { IconeCheck } from "@/components/icones";
import { CabecalhoVoltar, CaixaErro, corPilar, Esqueleto, Ponto } from "@/components/ui";
import { listarAulas } from "@/lib/ia";

export default function AulasSalvas() {
  const { temas, pilares } = useApp();
  const [aulas, setAulas] = useState<Awaited<ReturnType<typeof listarAulas>> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    listarAulas(200).then(setAulas, (e) => setErro(e.message));
  }, []);
  const pilarDe = (temaId: string | null) => pilares.find((p) => p.id === temas.find((t) => t.id === temaId)?.pilar_id);

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoVoltar voltar="/voce" sobre="Você" titulo="Aulas salvas" />
      {erro && <CaixaErro mensagem={erro} />}
      {!aulas && !erro && <Esqueleto />}
      {aulas?.length === 0 && <p className="text-sm text-texto-2">Nenhuma aula ainda. Comece pela tela Hoje.</p>}
      {aulas && aulas.length > 0 && (
        <ul className="cartao-ui flex flex-col p-0">
          {aulas.map((a) => (
            <li key={a.id} className="border-b border-borda last:border-b-0">
              <Link href={`/aula/${a.id}`} className="flex items-center gap-3 px-4 py-3.5">
                <Ponto cor={corPilar(pilarDe(a.tema_id)?.numero)} tamanho={8} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug font-semibold">{a.titulo}</span>
                  <span className="block text-[13px] text-texto-2">
                    {new Date(a.created_at).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} · {a.passo === "nucleo" ? "núcleo" : "paralela"}
                    {a.estudada_em ? "" : " · em andamento"}
                  </span>
                </span>
                {a.estudada_em && <IconeCheck className="text-ok" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
