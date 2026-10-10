"use client";

import Link from "next/link";
import { useEffect } from "react";
import { IconeAvancar, IconeFechar, IconeVoltar } from "./icones";

/** Cor de um pilar pelo número (0 = base física). */
export const corPilar = (numero: number | null | undefined) => (numero === null || numero === undefined ? "var(--texto-3)" : `var(--p${numero})`);

export function Ponto({ cor, tamanho = 7 }: { cor: string; tamanho?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: tamanho, height: tamanho, background: cor }} />;
}

export function Cabecalho({ sobre, titulo, acao }: { sobre?: React.ReactNode; titulo: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        {sobre && <div className="text-[13px] font-medium text-texto-2">{sobre}</div>}
        <h1 className="titulo-pagina mt-1.5">{titulo}</h1>
      </div>
      {acao}
    </header>
  );
}

/** Cabeçalho de tela de detalhe dentro de uma aba (com voltar). */
export function CabecalhoVoltar({ voltar, titulo, sobre }: { voltar: string; titulo: React.ReactNode; sobre?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <Link href={voltar} aria-label="Voltar" className="-ml-3 flex h-11 w-11 items-center justify-center rounded-xl text-texto-2">
        <IconeVoltar />
      </Link>
      <div>
        {sobre && <div className="text-[13px] font-medium text-texto-2">{sobre}</div>}
        <h1 className="titulo-pagina mt-1">{titulo}</h1>
      </div>
    </header>
  );
}

/** Linha de navegação (lista da tela Você e da Trilha). */
export function LinhaLink({ href, titulo, detalhe }: { href: string; titulo: React.ReactNode; detalhe?: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-[56px] items-center gap-3 border-b border-borda px-1 last:border-b-0">
      <span className="flex-1 text-[15px] font-semibold">{titulo}</span>
      {detalhe && <span className="text-[13px] text-texto-2">{detalhe}</span>}
      <IconeAvancar className="text-texto-3" />
    </Link>
  );
}

export function Secao({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="rotulo">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function Esqueleto({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-[20px] bg-superficie-2" />
      ))}
    </div>
  );
}

export function CaixaErro({ mensagem, acao }: { mensagem: string; acao?: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-2xl border border-borda bg-superficie p-4 text-sm leading-relaxed">
      <p className="font-semibold text-perigo">Não deu certo</p>
      <p className="mt-1 text-texto-2">{mensagem}</p>
      {acao && <div className="mt-3">{acao}</div>}
    </div>
  );
}

export function Aviso({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-superficie-2 px-3.5 py-3 text-sm leading-relaxed text-texto">{children}</div>;
}

/** Barra de progresso de 3 etapas usada no fluxo da aula. */
export function Etapas({ atual, fracao }: { atual: 0 | 1 | 2; fracao: number }) {
  const nomes = ["Objetivo", "Aula", "Fixar"];
  return (
    <div className="grid grid-cols-3 gap-1.5 px-2" aria-label={`Etapa ${atual + 1} de 3: ${nomes[atual]}`}>
      {nomes.map((n, i) => {
        const preenchido = i < atual ? 1 : i === atual ? Math.max(0.08, fracao) : 0;
        return (
          <div key={n} className="flex flex-col gap-1.5">
            <span className="h-1 overflow-hidden rounded-sm bg-superficie-2">
              <span className="block h-full bg-texto transition-all" style={{ width: `${preenchido * 100}%` }} />
            </span>
            <span className={`text-[11px] ${i === atual ? "font-semibold" : "text-texto-2"}`}>{n}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Topo das telas em fluxo (aula, revisão, Feynman): fechar/voltar + título. */
export function TopoFluxo({ href, titulo, rotuloFechar = "Fechar", voltar = false, children }: { href: string; titulo: string; rotuloFechar?: string; voltar?: boolean; children?: React.ReactNode }) {
  return (
    <header className="flex flex-none flex-col gap-2.5 px-3 pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <Link href={href} aria-label={rotuloFechar} className="flex h-11 w-11 items-center justify-center rounded-xl text-texto-2">
          {voltar ? <IconeVoltar /> : <IconeFechar />}
        </Link>
        <div className="truncate text-[13px] font-semibold">{titulo}</div>
        <span className="w-11" />
      </div>
      {children}
    </header>
  );
}

/** Folha inferior (bottom sheet) com véu; fecha com Esc ou toque fora. */
export function Folha({ aberta, aoFechar, rotulo, children }: { aberta: boolean; aoFechar: () => void; rotulo: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberta, aoFechar]);
  if (!aberta) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end md:items-center md:justify-center" style={{ background: "var(--veu)" }}>
      <button type="button" aria-label="Fechar" className="flex-1 cursor-default md:absolute md:inset-0" onClick={aoFechar} />
      <section role="dialog" aria-modal="true" aria-label={rotulo} className="relative flex max-h-[85dvh] flex-col gap-3.5 overflow-y-auto rounded-t-3xl bg-superficie px-5 pt-2.5 pb-8 md:w-[480px] md:rounded-3xl md:pt-5">
        <span aria-hidden className="h-1 w-9 self-center rounded-sm bg-borda md:hidden" />
        {children}
      </section>
    </div>
  );
}

/** Rodapé fixo das telas em fluxo. */
export function Rodape({ children }: { children: React.ReactNode }) {
  return <footer className="sticky bottom-0 mt-auto flex flex-none flex-col gap-2.5 bg-fundo px-5 pt-3 pb-[max(24px,env(safe-area-inset-bottom))]">{children}</footer>;
}
