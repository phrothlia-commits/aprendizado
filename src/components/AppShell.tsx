"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { carregarBase, semearSeNecessario } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { Configuracoes, Pilar, Tema } from "@/lib/tipos";
import { IconeBiblioteca, IconeHoje, IconeTrilha, IconeVoce } from "./icones";
import { Login } from "./Login";

type Contexto = {
  pilares: Pilar[];
  temas: Tema[];
  config: Configuracoes;
  recarregar: () => Promise<void>;
  email: string | null;
  nome: string | null;
  userId: string;
};

const FALTA_CONFIG = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const AppCtx = createContext<Contexto | null>(null);

export function useApp(): Contexto {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fora do AppShell");
  return c;
}

/** Quatro abas. Cada rota pertence a uma aba (para marcar a ativa). */
const ABAS = [
  { href: "/", rotulo: "Hoje", Icone: IconeHoje, rotas: ["/", "/revisar", "/diario"] },
  { href: "/trilha", rotulo: "Trilha", Icone: IconeTrilha, rotas: ["/trilha", "/feynman"] },
  { href: "/biblioteca", rotulo: "Biblioteca", Icone: IconeBiblioteca, rotas: ["/biblioteca"] },
  { href: "/voce", rotulo: "Você", Icone: IconeVoce, rotas: ["/voce", "/cartoes", "/habitos"] },
];

/** Telas em fluxo ocupam a tela inteira, sem as abas (uma ação principal por vez). */
const FLUXOS = ["/aula", "/revisar", "/feynman"];

function abaAtiva(caminho: string) {
  return ABAS.find((a) => a.rotas.some((r) => (r === "/" ? caminho === "/" || caminho.startsWith("/diario") : caminho.startsWith(r))))?.href;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [base, setBase] = useState<Pick<Contexto, "pilares" | "temas" | "config"> | null>(null);
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
        <div className="cartao-ui">
          <p className="font-semibold text-perigo">Erro ao carregar</p>
          <p className="mt-2 text-sm text-texto-2">{erro}</p>
          <p className="mt-2 text-sm text-texto-2">
            Se a mensagem fala de função ou tabela inexistente, rode os arquivos de <code>supabase/migrations</code> no SQL Editor do Supabase.
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

  const emFluxo = FLUXOS.some((f) => caminho.startsWith(f));
  const ativa = abaAtiva(caminho);
  const nome = (sessao.user.user_metadata?.nome as string | undefined)?.trim() || null;

  return (
    <AppCtx.Provider value={{ ...base, recarregar, email: sessao.user.email ?? null, nome, userId: sessao.user.id }}>
      {emFluxo ? (
        <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">{children}</div>
      ) : (
        <div className="flex min-h-dvh">
          <nav aria-label="Navegação principal" className="hidden w-[240px] flex-none flex-col gap-1 border-r border-borda bg-superficie px-4 py-7 md:flex">
            <div className="px-3 pb-6 font-serif text-[26px] font-medium tracking-[-0.01em]">Trilha</div>
            {ABAS.map(({ href, rotulo, Icone }) => (
              <Link
                key={href}
                href={href}
                aria-current={ativa === href ? "page" : undefined}
                className={`flex h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] ${ativa === href ? "bg-superficie-2 font-semibold" : "font-medium text-texto-2"}`}
              >
                <Icone tamanho={20} />
                {rotulo}
              </Link>
            ))}
          </nav>
          <div className="flex min-w-0 flex-1 flex-col">
            <main className="mx-auto w-full max-w-[1000px] flex-1 px-5 pt-[max(18px,env(safe-area-inset-top))] pb-28 md:px-10 md:pt-12 md:pb-12">{children}</main>
            <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-20 flex border-t border-borda bg-superficie px-2 pt-1.5 pb-[max(24px,env(safe-area-inset-bottom))] md:hidden">
              {ABAS.map(({ href, rotulo, Icone }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={ativa === href ? "page" : undefined}
                  className={`flex h-[52px] flex-1 flex-col items-center justify-center gap-[3px] text-[11px] ${ativa === href ? "font-semibold text-texto" : "font-medium text-texto-2"}`}
                >
                  <Icone tamanho={22} espessura={1.7} />
                  <span>{rotulo}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </AppCtx.Provider>
  );
}

function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return <div className="grid min-h-dvh place-items-center text-sm text-texto-2">{texto}</div>;
}
