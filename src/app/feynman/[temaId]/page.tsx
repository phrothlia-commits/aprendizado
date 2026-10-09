"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { IconeCheck, IconeEnviar, IconeFechar } from "@/components/icones";
import { CaixaErro, Rodape, TopoFluxo } from "@/components/ui";
import { atualizarTema } from "@/lib/db";
import { avaliarFeynman, guardarCartoesPropostos, historicoFeynman } from "@/lib/ia";
import type { AvaliacaoFeynman, CartaoProposto, RegistroFeynman } from "@/lib/tipos";

export default function Feynman() {
  const { temaId } = useParams<{ temaId: string }>();
  const { temas, recarregar } = useApp();
  const tema = temas.find((t) => t.id === temaId);
  const [historico, setHistorico] = useState<RegistroFeynman[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [atual, setAtual] = useState<{ explicacao: string; avaliacao: AvaliacaoFeynman } | null>(null);
  const [propostos, setPropostos] = useState<(CartaoProposto & { ok: boolean })[] | null>(null);
  const [guardados, setGuardados] = useState(0);

  const carregar = useCallback(() => {
    historicoFeynman(temaId).then(setHistorico, () => {});
  }, [temaId]);
  useEffect(carregar, [carregar]);

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      const r = await avaliarFeynman(temaId, texto);
      setAtual({ explicacao: texto, avaliacao: r.avaliacao });
      setPropostos(null);
      setGuardados(0);
      setTexto("");
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function guardar() {
    if (!propostos) return;
    const aprovados = propostos.filter((p) => p.ok);
    await guardarCartoesPropostos(aprovados, tema?.pilar_id ?? null, temaId);
    setGuardados(aprovados.length);
    setPropostos(null);
  }

  if (!tema) return <div className="p-5"><CaixaErro mensagem="Tema não encontrado." /></div>;
  const av = atual?.avaliacao;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopoFluxo href="/trilha/pilares" titulo="Explique com suas palavras" rotuloFechar="Voltar" voltar />
      <main className="flex flex-1 flex-col gap-5 px-5 pt-5">
        <div>
          <div className="text-[13px] font-medium text-texto-2">Como se explicasse para alguém de 12 anos</div>
          <h1 className="titulo-pagina mt-1">{tema.nome}</h1>
        </div>

        {!atual && (
          <div className="flex flex-col gap-2">
            <label htmlFor="explicacao" className="rotulo">
              Sua explicação, sem consultar
            </label>
            <textarea id="explicacao" rows={7} className="campo text-[16px] leading-relaxed" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Explique o conceito com palavras simples, com um exemplo do dia a dia." />
            <div className="text-xs text-texto-2">{texto.trim() ? texto.trim().split(/\s+/).length : 0} palavras · mínimo 15</div>
          </div>
        )}

        {atual && av && (
          <>
            <div className="rounded-2xl bg-superficie-2 px-4 py-3.5 font-serif text-[17px] leading-relaxed">{atual.explicacao}</div>
            <section aria-label="Resposta do tutor" className="cartao-ui flex flex-col gap-3.5">
              {av.correto.map((x, i) => (
                <Item key={`c${i}`} cor="var(--ok)" rotulo="Certo:" texto={x} />
              ))}
              {av.lacunas.map((x, i) => (
                <Item key={`l${i}`} cor="var(--alerta)" rotulo="Faltou:" texto={x} />
              ))}
              {av.erros.map((x, i) => (
                <Item key={`e${i}`} cor="var(--perigo)" rotulo="Ajuste:" texto={`“${x.trecho}” → ${x.correcao}${x.referencia ? ` (${x.referencia})` : ""}`} />
              ))}
              <div className="rounded-xl bg-superficie-2 px-3.5 py-3">
                <div className="rotulo mb-1.5">Para pensar</div>
                <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-snug">
                  {av.perguntas.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              </div>
              {av.referencias.length > 0 && <div className="text-xs text-texto-2">Fonte: {av.referencias.join(" · ")}</div>}
            </section>
            {av.atingiu_criterio && !tema.feynman_ok && (
              <button
                type="button"
                className="botao-secundario"
                onClick={async () => {
                  await atualizarTema(tema.id, { feynman_ok: true, explicacao_feynman: atual.explicacao });
                  await recarregar();
                }}
              >
                <IconeCheck /> Marcar critério Feynman como atingido
              </button>
            )}
            {tema.feynman_ok && <p className="text-sm font-semibold text-ok">Critério Feynman atingido neste nível.</p>}
          </>
        )}

        {propostos && (
          <section aria-label="Cartões das lacunas" className="flex flex-col gap-2.5">
            <h2 className="rotulo">Aprove os cartões</h2>
            {propostos.map((p, i) => (
              <div key={i} className={`flex items-start gap-2.5 rounded-2xl border border-borda bg-superficie p-3.5 ${p.ok ? "" : "opacity-45"}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{p.frente}</div>
                  <div className="mt-1 text-sm text-texto-2">{p.verso}</div>
                </div>
                <button type="button" aria-label={p.ok ? "Descartar" : "Aprovar"} aria-pressed={p.ok} onClick={() => setPropostos((l) => l!.map((y, k) => (k === i ? { ...y, ok: !y.ok } : y)))} className={`flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-xl ${p.ok ? "bg-ok text-white" : "border border-borda text-texto-2"}`}>
                  {p.ok ? <IconeCheck tamanho={18} /> : <IconeFechar tamanho={18} />}
                </button>
              </div>
            ))}
          </section>
        )}
        {guardados > 0 && <p className="text-sm font-semibold text-ok">{guardados} cartões guardados na revisão.</p>}
        {erro && <CaixaErro mensagem={erro} />}

        {historico.length > 0 && (
          <section className="flex flex-col gap-2 pb-4">
            <h2 className="rotulo">Tentativas anteriores</h2>
            {historico.map((h) => (
              <details key={h.id} className="rounded-2xl border border-borda bg-superficie px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  {new Date(h.created_at).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} · {h.avaliacao.atingiu_criterio ? "critério atingido" : `${h.avaliacao.lacunas.length} ${h.avaliacao.lacunas.length === 1 ? "lacuna" : "lacunas"}`}
                </summary>
                <p className="mt-2 text-sm text-texto-2">{h.explicacao}</p>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {h.avaliacao.lacunas.map((l, i) => (
                    <li key={i}>Faltou: {l}</li>
                  ))}
                </ul>
              </details>
            ))}
          </section>
        )}
      </main>
      <Rodape>
        {atual ? (
          <>
            {av && av.cartoes.length > 0 && !propostos && guardados === 0 && (
              <button type="button" className="botao-primario h-[52px]" onClick={() => setPropostos(av.cartoes.map((c) => ({ ...c, ok: true })))}>
                Transformar lacunas em {av.cartoes.length} {av.cartoes.length === 1 ? "cartão" : "cartões"}
              </button>
            )}
            {propostos && (
              <button type="button" className="botao-primario h-[52px]" onClick={guardar}>
                Guardar {propostos.filter((p) => p.ok).length} cartões
              </button>
            )}
            <button type="button" className="botao-secundario h-[52px]" onClick={() => setAtual(null)}>
              Tentar explicar de novo
            </button>
          </>
        ) : (
          <button type="button" className="botao-primario h-[52px]" disabled={enviando || texto.trim().split(/\s+/).length < 15} onClick={enviar}>
            {enviando ? "O tutor está lendo…" : "Enviar para o tutor"}
            {!enviando && <IconeEnviar />}
          </button>
        )}
      </Rodape>
    </div>
  );
}

function Item({ cor, rotulo, texto }: { cor: string; rotulo: string; texto: string }) {
  return (
    <div className="flex gap-2.5">
      <span aria-hidden className="mt-[7px] h-2 w-2 flex-none rounded-full" style={{ background: cor }} />
      <p className="text-[15px] leading-relaxed">
        <span className="font-semibold">{rotulo}</span> {texto}
      </p>
    </div>
  );
}
