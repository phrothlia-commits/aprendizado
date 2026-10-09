"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMsg(null);
    const sb = supabase();
    const { data, error } =
      modo === "entrar"
        ? await sb.auth.signInWithPassword({ email, password: senha })
        : await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin } });
    setEnviando(false);
    if (error) setMsg(traduzir(error.message));
    else if (modo === "criar" && !data.session) setMsg("Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.");
  }

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <form onSubmit={enviar} className="cartao-ui w-full max-w-sm space-y-4">
        <div>
          <h1 className="titulo-pagina">Trilha de Estudos</h1>
          <p className="text-sm text-texto-2">O que eu estudo e reviso hoje?</p>
        </div>
        <label className="block">
          <span className="rotulo">E-mail</span>
          <input className="campo" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="rotulo">Senha</span>
          <input
            className="campo"
            type="password"
            autoComplete={modo === "entrar" ? "current-password" : "new-password"}
            minLength={8}
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>
        {msg && <p className="text-sm text-alerta">{msg}</p>}
        <button className="botao-primario w-full" disabled={enviando}>
          {enviando ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}
        </button>
        <button type="button" className="w-full text-center text-xs text-texto-2 underline" onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}>
          {modo === "entrar" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}
        </button>
      </form>
    </main>
  );
}

function traduzir(m: string): string {
  if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link recebido antes de entrar.";
  if (/signups not allowed/i.test(m)) return "Cadastro desativado. Use a conta existente.";
  if (/already registered/i.test(m)) return "Este e-mail já tem conta. Use “Entrar”.";
  return m;
}
