import "server-only";
import { processarArquivo } from "./biblioteca/processar";
import { BETAS_FALLBACK, clienteIA, MODELO } from "./ia/cliente";
import { prompt } from "./prompts";
import { repoSupabase } from "./repo";
import { criarRotas } from "./rotas";
import { autenticar } from "./supabase";

/** Rotas com as dependências reais: Supabase do usuário e API do Claude. */
export const rotas = criarRotas({
  autenticar,
  deps: (ctx) => {
    const cliente = clienteIA();
    return {
      // Streaming evita timeout em respostas longas; o SDK junta a mensagem final.
      ia: { chamar: (params) => cliente.beta.messages.stream(params).finalMessage() },
      repo: repoSupabase(ctx.sb),
      prompts: prompt,
      modelo: MODELO,
      betas: BETAS_FALLBACK,
    };
  },
  processar: processarArquivo,
});
