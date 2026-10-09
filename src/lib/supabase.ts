import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

/**
 * Cliente único do navegador. O acesso é protegido por login e por
 * Row Level Security no banco: cada usuário só enxerga as próprias linhas.
 */
export function supabase(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env.local");
  }
  cliente = createClient(url, chave, { auth: { persistSession: true, autoRefreshToken: true } });
  return cliente;
}
