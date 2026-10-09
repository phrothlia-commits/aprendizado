"use client";

import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { baixarArquivo, paraCsv } from "@/lib/csv";
import { dataLocal } from "@/lib/datas";
import { exportarTudo, lerTudo, salvarConfig } from "@/lib/db";
import { ROTINA_SEMANAL } from "@/lib/hoje";
import { supabase } from "@/lib/supabase";
import { TABELAS_EXPORTACAO } from "@/lib/tipos";

export default function Mais() {
  const { config, recarregar, email } = useApp();
  const [novos, setNovos] = useState(config.novos_por_dia);
  const [revisoes, setRevisoes] = useState(config.revisoes_por_dia);
  const [algoritmo, setAlgoritmo] = useState(config.algoritmo);
  const [msg, setMsg] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  async function exportarJson() {
    setExportando(true);
    try {
      const dados = await exportarTudo();
      baixarArquivo(`trilha-backup-${dataLocal()}.json`, JSON.stringify({ exportado_em: new Date().toISOString(), ...dados }, null, 2), "application/json");
    } finally {
      setExportando(false);
    }
  }

  async function exportarCsv(tabela: string) {
    baixarArquivo(`trilha-${tabela}-${dataLocal()}.csv`, paraCsv(await lerTudo(tabela)), "text/csv;charset=utf-8");
  }

  return (
    <div className="space-y-5">
      <h1 className="titulo-pagina">Mais</h1>

      <section className="cartao-ui space-y-3">
        <p className="rotulo">Revisão</p>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="text-sm">Novos por dia</span>
            <input className="campo" type="number" min={0} max={500} value={novos} onChange={(e) => setNovos(Number(e.target.value))} />
          </label>
          <label>
            <span className="text-sm">Revisões por dia</span>
            <input className="campo" type="number" min={0} max={2000} value={revisoes} onChange={(e) => setRevisoes(Number(e.target.value))} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm">Algoritmo</span>
          <select className="campo" value={algoritmo} onChange={(e) => setAlgoritmo(e.target.value as typeof algoritmo)}>
            <option value="fsrs">FSRS (recomendado)</option>
            <option value="sm2">SM-2 (clássico)</option>
          </select>
          {algoritmo !== config.algoritmo && <span className="text-xs text-alerta">Ao trocar, cada cartão recomeça o agendamento na próxima revisão.</span>}
        </label>
        <div className="flex items-center gap-3">
          <button
            className="botao-primario"
            onClick={async () => {
              await salvarConfig({ novos_por_dia: novos, revisoes_por_dia: revisoes, algoritmo });
              await recarregar();
              setMsg("Salvo ✓");
            }}
          >
            Salvar
          </button>
          {msg && <span className="text-sm text-sucesso">{msg}</span>}
        </div>
      </section>

      <section className="cartao-ui space-y-3">
        <p className="rotulo">Exportar dados</p>
        <p className="text-sm text-texto-2">Backup completo de tudo o que está no banco. Guarde uma cópia por semana.</p>
        <button className="botao-primario" onClick={exportarJson} disabled={exportando}>
          {exportando ? "Exportando…" : "Baixar tudo em JSON"}
        </button>
        <div className="flex flex-wrap gap-2">
          {TABELAS_EXPORTACAO.map((t) => (
            <button key={t} className="rounded-full border border-borda px-3 py-1 text-xs" onClick={() => exportarCsv(t)}>
              {t}.csv
            </button>
          ))}
        </div>
      </section>

      <section className="cartao-ui">
        <p className="rotulo mb-2">Rotina semanal</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {ROTINA_SEMANAL.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-texto-2">O roteiro guiado de revisão semanal entra na Fase 2.</p>
      </section>

      <section className="cartao-ui flex items-center justify-between">
        <p className="text-sm text-texto-2">{email}</p>
        <button className="botao-secundario" onClick={() => supabase().auth.signOut()}>
          Sair
        </button>
      </section>
    </div>
  );
}
