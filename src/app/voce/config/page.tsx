"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { Aviso, CabecalhoVoltar, Secao } from "@/components/ui";
import { baixarArquivo, paraCsv } from "@/lib/csv";
import { dataLocal } from "@/lib/datas";
import { exportarTudo, lerTudo, salvarConfig } from "@/lib/db";
import { ROTINA_SEMANAL } from "@/lib/hoje";
import { painelIA, resumoIA, statusIA } from "@/lib/ia";
import { supabase } from "@/lib/supabase";
import { TABELAS_EXPORTACAO, type Configuracoes as Config, type ModeloIA } from "@/lib/tipos";
import { MAX_BUSCAS_PADRAO, MODELO_PADRAO, MODELOS_PERMITIDOS, NOME_MODELO, TETO_MENSAL_PADRAO, type EtapaModelo } from "@/server/ia/modelos";

const FUNCOES: Record<string, string> = {
  aula_pesquisa: "Aula · busca de fontes",
  aula_composicao: "Aula · composição",
  aula_correcao: "Aula · correção pontual",
  aula_composicao_reparo: "Aula · reparo do formato",
  feynman: "Tutor Feynman",
  feynman_reparo: "Tutor Feynman · reparo",
  explicar: "Explicar de outro jeito",
  explicar_reparo: "Explicar · reparo",
  busca_pdf: "Busca de PDF legal",
};

const ETAPAS_MODELO: { etapa: EtapaModelo; rotulo: string; dica: string }[] = [
  { etapa: "pesquisa", rotulo: "Pesquisa de fontes", dica: "Busca na web (só Sonnet ou Opus)." },
  { etapa: "composicao", rotulo: "Composição da aula", dica: "Opus escreve com mais profundidade e custa o dobro." },
  { etapa: "feynman", rotulo: "Tutor Feynman", dica: "" },
  { etapa: "explicar", rotulo: "Explicar de outro jeito", dica: "" },
  { etapa: "reparo", rotulo: "Reparo do formato (JSON)", dica: "Raro: só quando a resposta vem fora do formato." },
];
const CAMPO_MODELO: Record<EtapaModelo, keyof Config> = {
  pesquisa: "ia_modelo_pesquisa",
  composicao: "ia_modelo_composicao",
  feynman: "ia_modelo_feynman",
  explicar: "ia_modelo_explicar",
  reparo: "ia_modelo_reparo",
};
const dolar = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Configuracoes() {
  const { config, recarregar, email, nome } = useApp();
  const [nomeEd, setNomeEd] = useState(nome ?? "");
  const [novos, setNovos] = useState(config.novos_por_dia);
  const [revisoes, setRevisoes] = useState(config.revisoes_por_dia);
  const [algoritmo, setAlgoritmo] = useState(config.algoritmo);
  const [limiteIA, setLimiteIA] = useState(config.ia_limite_diario ?? 20);
  // Colunas da migração 0003: só aparecem (e só são salvas) depois que ela roda.
  const migrado = "ia_teto_mensal_usd" in config;
  const [teto, setTeto] = useState(Number(config.ia_teto_mensal_usd ?? TETO_MENSAL_PADRAO));
  const [maxBuscas, setMaxBuscas] = useState(config.ia_max_buscas ?? MAX_BUSCAS_PADRAO);
  const [nivel, setNivel] = useState(config.ia_nivel ?? "iniciante");
  const [modelos, setModelos] = useState<Record<EtapaModelo, ModeloIA>>(() => {
    const m = { ...MODELO_PADRAO } as Record<EtapaModelo, ModeloIA>;
    for (const { etapa } of ETAPAS_MODELO) {
      const v = config[CAMPO_MODELO[etapa]] as ModeloIA | undefined;
      if (v && (MODELOS_PERMITIDOS[etapa] as string[]).includes(v)) m[etapa] = v;
    }
    return m;
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [ia, setIa] = useState<{
    status: Awaited<ReturnType<typeof statusIA>>;
    resumo: Awaited<ReturnType<typeof resumoIA>> | null;
    painel: Awaited<ReturnType<typeof painelIA>>;
  } | null>(null);

  useEffect(() => {
    Promise.all([statusIA(), resumoIA().catch(() => null), painelIA().catch(() => null)]).then(([status, resumo, painel]) => setIa({ status, resumo, painel }));
  }, []);

  async function salvar() {
    const extras: Partial<Config> = migrado
      ? {
          ia_teto_mensal_usd: teto,
          ia_max_buscas: maxBuscas,
          ia_nivel: nivel,
          ia_modelo_pesquisa: modelos.pesquisa,
          ia_modelo_composicao: modelos.composicao,
          ia_modelo_feynman: modelos.feynman,
          ia_modelo_explicar: modelos.explicar,
          ia_modelo_reparo: modelos.reparo,
        }
      : {};
    await salvarConfig({ novos_por_dia: novos, revisoes_por_dia: revisoes, algoritmo, ia_limite_diario: limiteIA, ...extras });
    if (nomeEd.trim() !== (nome ?? "")) await supabase().auth.updateUser({ data: { nome: nomeEd.trim() } });
    await recarregar();
    setMsg("Salvo");
    setTimeout(() => setMsg(null), 2000);
  }

  async function exportarJson() {
    setExportando(true);
    try {
      const dados = await exportarTudo();
      baixarArquivo(`trilha-backup-${dataLocal()}.json`, JSON.stringify({ exportado_em: new Date().toISOString(), ...dados }, null, 2), "application/json");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoVoltar voltar="/voce" sobre="Você" titulo="Configurações" />

      <Secao titulo="Inteligência artificial">
        <div className="cartao-ui flex flex-col gap-3.5">
          {ia && !ia.status?.configurada && <Aviso>A IA ainda não está configurada. Cadastre a variável ANTHROPIC_API_KEY na Vercel e faça um novo deploy.</Aviso>}
          {ia?.status?.alerta === "perto_do_teto" && <Aviso>O gasto do mês já passou de 80% do teto. Ao chegar a 100%, a IA fica bloqueada até você aumentar o teto.</Aviso>}
          {ia?.status?.alerta === "bloqueado" && <Aviso>O gasto do mês chegou ao teto: a IA está bloqueada. Aumente o teto abaixo para continuar.</Aviso>}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-superficie-2 p-3">
              <div className="text-xs text-texto-2">Gasto do mês (estimado)</div>
              <div className="num mt-1 font-serif text-[26px] leading-tight font-medium">{ia?.resumo ? dolar(ia.resumo.custoMes) : "–"}</div>
              <div className="text-xs text-texto-2">
                {migrado ? `teto ${dolar(teto)}` : `${ia?.resumo?.chamadasMes ?? 0} chamadas`}
              </div>
            </div>
            <div className="rounded-xl bg-superficie-2 p-3">
              <div className="text-xs text-texto-2">Hoje</div>
              <div className="num mt-1 font-serif text-[26px] leading-tight font-medium">
                {ia?.resumo?.chamadasHoje ?? 0}
                <span className="font-sans text-sm text-texto-2"> / {limiteIA}</span>
              </div>
              <div className="text-xs text-texto-2">{ia?.resumo ? dolar(ia.resumo.custoHoje) : ""}</div>
            </div>
          </div>
          {ia?.painel && (
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-superficie-2 p-3">
                <div className="text-xs text-texto-2">Custo médio por aula</div>
                <div className="num mt-1 font-serif text-[22px] leading-tight font-medium">
                  {ia.painel.painel.aulas_mes ? dolar(ia.painel.painel.custo_aulas_mes / ia.painel.painel.aulas_mes) : "–"}
                </div>
                <div className="text-xs text-texto-2">{ia.painel.painel.aulas_mes} aulas no mês</div>
              </div>
              <div className="rounded-xl bg-superficie-2 p-3">
                <div className="text-xs text-texto-2">Gerações com sucesso</div>
                <div className="num mt-1 font-serif text-[22px] leading-tight font-medium">
                  {ia.painel.painel.geracoes_mes ? `${Math.round((100 * ia.painel.painel.geracoes_ok_mes) / ia.painel.painel.geracoes_mes)}%` : "–"}
                </div>
                <div className="text-xs text-texto-2">
                  {ia.painel.painel.geracoes_ok_mes} de {ia.painel.painel.geracoes_mes}
                </div>
              </div>
              <div className="col-span-2 rounded-xl bg-superficie-2 p-3">
                <div className="text-xs text-texto-2">Economia no mês</div>
                <div className="num mt-1 font-serif text-[22px] leading-tight font-medium">{dolar(ia.painel.painel.economia_cache_usd + ia.painel.painel.economia_reuso_usd)}</div>
                <div className="text-xs leading-relaxed text-texto-2">
                  Cache de prompt: {Math.round(ia.painel.painel.cache_tokens_mes).toLocaleString("pt-BR")} tokens ({dolar(ia.painel.painel.economia_cache_usd)}) · fontes e etapas
                  reaproveitadas: {ia.painel.painel.reaproveitamentos_mes}× ({dolar(ia.painel.painel.economia_reuso_usd)})
                </div>
              </div>
            </div>
          )}
          {ia?.resumo && ia.resumo.porFuncao.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {ia.resumo.porFuncao.map((f) => (
                <li key={f.funcao} className="flex justify-between gap-3">
                  <span className="text-texto-2">
                    {FUNCOES[f.funcao] ?? f.funcao} · {f.chamadas}×
                  </span>
                  <span className="num">{dolar(f.custo)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
              Chamadas de IA por dia
              <input className="campo" type="number" min={0} max={500} value={limiteIA} onChange={(e) => setLimiteIA(Number(e.target.value))} />
            </label>
            {migrado && (
              <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
                Teto mensal (US$)
                <input className="campo" type="number" min={0} max={1000} step={1} value={teto} onChange={(e) => setTeto(Number(e.target.value))} />
              </label>
            )}
          </div>
          {migrado ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
                  Buscas por pesquisa
                  <input className="campo" type="number" min={1} max={10} value={maxBuscas} onChange={(e) => setMaxBuscas(Number(e.target.value))} />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
                  Seu nível
                  <select className="campo" value={nivel} onChange={(e) => setNivel(e.target.value as typeof nivel)}>
                    <option value="iniciante">Iniciante</option>
                    <option value="intermediario">Intermediário</option>
                    <option value="avancado">Avançado</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-col gap-2.5">
                <div className="rotulo">Modelo por etapa</div>
                {ETAPAS_MODELO.map(({ etapa, rotulo, dica }) => (
                  <label key={etapa} className="flex flex-col gap-1 text-[13px] text-texto-2">
                    {rotulo}
                    <select className="campo" value={modelos[etapa]} onChange={(e) => setModelos((m) => ({ ...m, [etapa]: e.target.value as ModeloIA }))}>
                      {MODELOS_PERMITIDOS[etapa].map((id) => (
                        <option key={id} value={id}>
                          {NOME_MODELO[id]}
                          {id === MODELO_PADRAO[etapa] ? " (padrão)" : ""}
                        </option>
                      ))}
                    </select>
                    {dica && <span className="text-xs">{dica}</span>}
                  </label>
                ))}
              </div>
            </>
          ) : (
            <Aviso>Rode a migração 0003_ia_otimizacao.sql no Supabase para escolher modelos, teto mensal e número de buscas.</Aviso>
          )}
          <p className="text-xs leading-relaxed text-texto-2">
            Uma aula usa 2 chamadas (busca e composição), ou só 1 quando as fontes do tema estão guardadas; a conferência automática faz no máximo 1 chamada extra, e só quando
            algo falha. Custo estimado pela tabela pública de preços; a fatura oficial está no Console da Anthropic.
          </p>
          {ia?.painel && ia.painel.erros.length > 0 && (
            <details className="text-xs text-texto-2">
              <summary className="cursor-pointer font-semibold">Últimos erros (detalhe técnico)</summary>
              <ul className="mt-2 flex flex-col gap-2">
                {ia.painel.erros.map((e) => (
                  <li key={e.created_at} className="rounded-lg bg-superficie-2 p-2.5 break-words">
                    <div>
                      {new Date(e.created_at).toLocaleString("pt-BR")} · {e.etapa ?? "?"} · {e.erro}
                      {e.erro_detalhe?.status ? ` · HTTP ${e.erro_detalhe.status}` : ""}
                      {e.erro_detalhe?.modelo ? ` · ${e.erro_detalhe.modelo}` : ""}
                    </div>
                    {e.erro_detalhe?.mensagem && <div className="mt-1 font-mono">{e.erro_detalhe.mensagem}</div>}
                    {e.erro_detalhe?.request_id && <div className="mt-1 font-mono">request_id: {e.erro_detalhe.request_id}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Secao>

      <Secao titulo="Perfil e revisão">
        <div className="cartao-ui flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
            Seu nome (aparece em Hoje)
            <input className="campo" value={nomeEd} onChange={(e) => setNomeEd(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
              Novos por dia
              <input className="campo" type="number" min={0} max={500} value={novos} onChange={(e) => setNovos(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
              Revisões por dia
              <input className="campo" type="number" min={0} max={2000} value={revisoes} onChange={(e) => setRevisoes(Number(e.target.value))} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
            Algoritmo de revisão
            <select className="campo" value={algoritmo} onChange={(e) => setAlgoritmo(e.target.value as typeof algoritmo)}>
              <option value="fsrs">FSRS (recomendado)</option>
              <option value="sm2">SM-2 (clássico)</option>
            </select>
            {algoritmo !== config.algoritmo && <span className="text-xs text-alerta">Ao trocar, cada cartão recomeça o agendamento na próxima revisão.</span>}
          </label>
        </div>
      </Secao>
      <div className="flex items-center gap-3">
        <button className="botao-primario flex-1" onClick={salvar}>
          Salvar
        </button>
        {msg && <span className="text-sm font-semibold text-ok">{msg}</span>}
      </div>

      <Secao titulo="Exportar dados">
        <div className="cartao-ui flex flex-col gap-3">
          <p className="text-sm text-texto-2">Backup completo de tudo o que está no banco. Guarde uma cópia por semana.</p>
          <button className="botao-secundario" onClick={exportarJson} disabled={exportando}>
            {exportando ? "Exportando…" : "Baixar tudo em JSON"}
          </button>
          <div className="flex flex-wrap gap-2">
            {TABELAS_EXPORTACAO.map((t) => (
              <button key={t} className="h-9 cursor-pointer rounded-full bg-superficie-2 px-3 text-xs font-semibold" onClick={async () => baixarArquivo(`trilha-${t}-${dataLocal()}.csv`, paraCsv(await lerTudo(t)), "text/csv;charset=utf-8")}>
                {t}.csv
              </button>
            ))}
          </div>
        </div>
      </Secao>

      <Secao titulo="Rotina semanal">
        <ul className="cartao-ui flex list-disc flex-col gap-1.5 pl-9 text-sm leading-snug">
          {ROTINA_SEMANAL.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Secao>

      <div className="cartao-ui flex items-center justify-between gap-3">
        <p className="truncate text-sm text-texto-2">{email}</p>
        <button className="botao-secundario h-11" onClick={() => supabase().auth.signOut()}>
          Sair
        </button>
      </div>
    </div>
  );
}
