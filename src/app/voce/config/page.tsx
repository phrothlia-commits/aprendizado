"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { Aviso, CabecalhoVoltar, Secao } from "@/components/ui";
import { baixarArquivo, paraCsv } from "@/lib/csv";
import { dataLocal } from "@/lib/datas";
import { exportarTudo, lerTudo, salvarConfig } from "@/lib/db";
import { ROTINA_SEMANAL } from "@/lib/hoje";
import { iaConfigurada, resumoIA } from "@/lib/ia";
import { supabase } from "@/lib/supabase";
import { TABELAS_EXPORTACAO } from "@/lib/tipos";

const FUNCOES: Record<string, string> = { aula_pesquisa: "Aula · busca de fontes", aula_composicao: "Aula · composição", feynman: "Tutor Feynman", busca_pdf: "Busca de PDF legal" };
const dolar = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Configuracoes() {
  const { config, recarregar, email, nome } = useApp();
  const [nomeEd, setNomeEd] = useState(nome ?? "");
  const [novos, setNovos] = useState(config.novos_por_dia);
  const [revisoes, setRevisoes] = useState(config.revisoes_por_dia);
  const [algoritmo, setAlgoritmo] = useState(config.algoritmo);
  const [limiteIA, setLimiteIA] = useState(config.ia_limite_diario ?? 20);
  const [msg, setMsg] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [ia, setIa] = useState<{ configurada: boolean; resumo: Awaited<ReturnType<typeof resumoIA>> | null } | null>(null);

  useEffect(() => {
    Promise.all([iaConfigurada(), resumoIA().catch(() => null)]).then(([configurada, resumo]) => setIa({ configurada, resumo }));
  }, []);

  async function salvar() {
    await salvarConfig({ novos_por_dia: novos, revisoes_por_dia: revisoes, algoritmo, ia_limite_diario: limiteIA });
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
          {ia && !ia.configurada && <Aviso>A IA ainda não está configurada. Cadastre a variável ANTHROPIC_API_KEY na Vercel e faça um novo deploy.</Aviso>}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-superficie-2 p-3">
              <div className="text-xs text-texto-2">Gasto do mês (estimado)</div>
              <div className="num mt-1 font-serif text-[26px] leading-tight font-medium">{ia?.resumo ? dolar(ia.resumo.custoMes) : "–"}</div>
              <div className="text-xs text-texto-2">{ia?.resumo?.chamadasMes ?? 0} chamadas</div>
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
          <label className="flex flex-col gap-1.5 text-[13px] text-texto-2">
            Limite de chamadas de IA por dia
            <input className="campo" type="number" min={0} max={500} value={limiteIA} onChange={(e) => setLimiteIA(Number(e.target.value))} />
          </label>
          <p className="text-xs leading-relaxed text-texto-2">Cada aula usa 2 chamadas (busca de fontes e composição); o Tutor Feynman e a busca de PDF usam 1. Custo estimado pela tabela pública de preços; a fatura oficial está no Console da Anthropic.</p>
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
