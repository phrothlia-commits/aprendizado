import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { erros } from "./ia/erros";

/**
 * Cliente do Supabase agindo COMO o usuário (token do login no header):
 * o RLS continua valendo no servidor. Não usamos a chave secreta (service_role).
 */
export function clienteDoUsuario(token: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) throw new Error("Supabase não configurado");
  return createClient(url, chave, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function autenticar(req: Request): Promise<{ sb: SupabaseClient; userId: string }> {
  const cabecalho = req.headers.get("authorization") ?? "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";
  if (!token) throw erros.naoAutenticado();
  const sb = clienteDoUsuario(token);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw erros.naoAutenticado();
  return { sb, userId: data.user.id };
}
