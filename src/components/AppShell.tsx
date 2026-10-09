"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { carregarBase, semearSeNecessario } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { Configuracoes, Pilar, Tema } from "@/lib/tipos";
import { Login } from "./Login";

type Contexto = {
  pilares: Pilar[];
  temas: Tema[];
  config: Configuracoes;
  recarregar: () => Promise<void>;
  email: string | null;
};

const FALTA_CONFIG = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const AppCtx = createContext<Contexto | null>(null);

export function useApp(): Contexto {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fora do AppShell");
  return c;
}

const NAV = [
  { href: "/", rotulo: "Hoje", icone: "☀" },
  { href: "/revisar", rotulo: "Revisar", icone: "↻" },
  { href: "/trilha", rotulo: "Trilha", icone: "◎" },
  { href: "/cartoes", rotulo: "Cartões", icone: "▤" },
  { href: "/diario", rotulo: "Diário", icone: "✎" },
  { href: "/mais", rotulo: "Mais", icone: "⋯" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [base, setBase] = useState<Omit<Contexto, "recarregar" | "email"> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const caminho = usePathname();

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (FALTA_CONFIG) return;
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const recarregar = useCallback(async () => {
    setBase(await carregarBase());
  }, []);

  const userId = sessao?.user.id;
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        await semearSeNecessario();
        await recarregar();
      } catch (e) {
        setErro((e as Error).message);
      }
    })();
  }, [userId, recarregar]);

  if (FALTA_CONFIG) {
    return <p className="p-6 text-perigo">Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (veja .env.example).</p>;
  }
  if (erro) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <div className="cartao-ui border-perigo">
          <p className="font-semibold text-perigo">Erro ao carregar</p>
          <p className="mt-2 text-sm text-texto-2">{erro}</p>
          <p className="mt-2 text-sm text-texto-2">
            Se a mensagem fala de função ou tabela inexistente, rode o arquivo <code>supabase/migrations/0001_schema.sql</code> no SQL Editor do Supabase.
          </p>
          <button className="botao-secundario mt-4" onClick={() => location.reload()}>
            Tentar de novo
          </button>
        </div>
      </main>
    );
  }
  if (sessao === undefined) return <Carregando />;
  if (sessao === null) return <Login />;
  if (!base) return <Carregando texto="Preparando sua trilha…" />;

  return (
    <AppCtx.Provider value={{ ...base, recarregar, email: sessao.user.email ?? null }}>
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col md:flex-row md:max-w-5xl">
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:w-48 md:shrink-0 md:border-r md:border-t-0 md:bg-transparent md:pt-6">
          <ul className="flex justify-around md:flex-col md:gap-1 md:px-3">
            {NAV.map((n) => {
              const ativo = n.href === "/" ? caminho === "/" : caminho.startsWith(n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className={`flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] md:flex-row md:gap-3 md:rounded-lg md:px-3 md:text-sm ${
                      ativo ? "text-destaque md:bg-superficie-2 font-semibold" : "text-texto-2"
                    }`}
                  >
                    <span className="text-lg leading-none" aria-hidden>
                      {n.icone}
                    </span>
                    {n.rotulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">{children}</main>
      </div>
    </AppCtx.Provider>
  );
}

function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return <div className="grid min-h-dvh place-items-center text-sm text-texto-2">{texto}</div>;
}
