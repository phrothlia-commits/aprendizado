import { connection } from "next/server";
import { iaConfigurada } from "@/server/ia/cliente";

/** Diz se a chave da IA existe no servidor, sem nunca revelar o valor. */
export async function GET() {
  await connection(); // responde na hora da requisição, não no build
  return Response.json({ configurada: iaConfigurada() }, { headers: { "cache-control": "no-store" } });
}
