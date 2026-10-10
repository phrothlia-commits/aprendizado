import "server-only";
import { processarArquivo } from "./biblioteca/processar";
import { clienteIA, iaConfigurada } from "./ia/cliente";
import type { PortaIA } from "./ia/tipos";
import { prompt } from "./prompts";
import { repoSupabase } from "./repo";
import { criarRotas } from "./rotas";
import { autenticar } from "./supabase";

/** Rotas com as dependências reais: Supabase do usuário e API do Claude. */
export const rotas = criarRotas({
  autenticar,
  repo: (ctx) => repoSupabase(ctx.sb),
  ia: (): PortaIA => {
    const cliente = clienteIA();
    return {
      // Streaming em todas as chamadas: evita timeout em respostas longas e mede o progresso.
      chamar: (params, opcoes) => {
        const stream = cliente.beta.messages.stream(params);
        if (opcoes?.aoTexto) {
          let total = 0;
          stream.on("text", (delta) => {
            total += delta.length;
            opcoes.aoTexto!(total);
          });
        }
        return stream.finalMessage();
      },
    };
  },
  iaConfigurada,
  prompts: prompt,
  processar: processarArquivo,
});
