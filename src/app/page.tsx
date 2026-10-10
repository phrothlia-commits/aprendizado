"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { IconeCheck, IconeExterno, IconeSeta } from "@/components/icones";
import { CaixaErro, corPilar, Esqueleto, Ponto } from "@/components/ui";
import { deDataLocal, formatarData, somarDias } from "@/lib/datas";
import { dadosHoje, registrarSabedoria, salvarHabito } from "@/lib/db";
import { calcularSequencia, itensDoDia, minutosRevisao, montarResumo, sabedoriaDoDia, trimestreAtual, type ModoDia } from "@/lib/hoje";

type Dados = Awaited<ReturnType<typeof dadosHoje>>;
type PassoId = "sabedoria" | "aprender" | "paralela" | "fixar" | "refletir";

const META_CORPO = 150;

function saudacao(nome: string | null) {
  const h = new Date().getHours();
  const s = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  return nome ? `${s}, ${nome.split(" ")[0]}` : s;
}

function linkBiblia(livro: string, capitulo: number) {
  return `https://www.bibliaonline.com.br/acf/${livro === "Provérbios" ? "pv" : "sl"}/${capitulo}`;
}

export default function Hoje() {
  const { pilares, temas, config, nome } = useApp();
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    dadosHoje().then(setD, (e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  if (erro) return <CaixaErro mensagem={erro} acao={<button className="botao-secundario" onClick={carregar}>Tentar de novo</button>} />;
  if (!d) return <Esqueleto />;

  const modo: ModoDia = d.habito?.modo ?? "padrao";
  const minimo = modo === "minimo";
  const checklist = d.habito?.checklist ?? {};
  const novosRestantes = Math.max(0, Math.min(config.novos_por_dia - d.novosHoje, d.novosDisponiveis));
  const pendentes = Math.min(d.vencidos + novosRestantes, Math.max(0, config.revisoes_por_dia - d.revisoesHoje));
  const diarioCompleto = Boolean(d.diario?.aprendizado_1 && d.diario?.aprendizado_2 && d.diario?.aprendizado_3);
  const feitoNucleo = d.sessoesHoje.includes("nucleo");
  const feitoParalela = d.sessoesHoje.includes("paralela");
  const resumo = montarResumo({
    modo,
    data: d.hoje,
    checklist: { ...checklist, nucleo: feitoNucleo || !!checklist.nucleo, paralela: feitoParalela || !!checklist.paralela },
    cartoesPendentes: pendentes,
    revisoesHoje: d.revisoesHoje,
    diarioCompleto,
  });
  const feitos = resumo.minutosTotais - resumo.minutosRestantes;
  const seq = calcularSequencia(d.diasAtivos, d.hoje);
  const { atual } = trimestreAtual(d.trimestres, d.hoje);
  const sabedoria = sabedoriaDoDia(d.hoje);
  const diaDeParalela = !minimo && itensDoDia("padrao", d.hoje).some((i) => i.id === "paralela");
  const amanhaParalela = itensDoDia("padrao", somarDias(d.hoje, 1)).some((i) => i.id === "paralela");

  const pilarDoTema = (id: string | null) => pilares.find((p) => p.id === temas.find((t) => t.id === id)?.pilar_id);
  const temaNome = (id: string | null) => temas.find((t) => t.id === id)?.nome;
  const aulasDoPasso = (passo: "nucleo" | "paralela") => d.aulas.filter((a) => a.trimestre_id === atual?.id && a.passo === passo);
  const emAndamento = (passo: "nucleo" | "paralela") => aulasDoPasso(passo).find((a) => !a.estudada_em);
  const numeroAula = (passo: "nucleo" | "paralela") => aulasDoPasso(passo).filter((a) => a.estudada_em).length + 1;

  const sabedoriaFeita = !!checklist.sabedoria;
  const fixarFeito = pendentes === 0;
  const passos: { id: PassoId; feito: boolean; pular?: boolean }[] = [
    { id: "sabedoria", feito: sabedoriaFeita },
    { id: "aprender", feito: feitoNucleo, pular: minimo || !atual },
    ...(diaDeParalela && atual ? [{ id: "paralela" as const, feito: feitoParalela }] : []),
    { id: "fixar", feito: fixarFeito },
    { id: "refletir", feito: diarioCompleto },
  ];
  const atualId = passos.find((p) => !p.feito && !p.pular)?.id ?? null;

  async function alternarChecklist(id: string) {
    const novo = { ...checklist, [id]: !checklist[id] };
    setD((x) => x && { ...x, habito: { ...(x.habito ?? ({} as never)), modo, checklist: novo } });
    await salvarHabito(d!.hoje, { checklist: novo, modo });
    if (id === "sabedoria") await registrarSabedoria(d!.hoje, sabedoria.livro, sabedoria.referencia, novo[id]);
    carregar();
  }

  async function trocarModo() {
    const novoModo: ModoDia = minimo ? "padrao" : "minimo";
    setD((x) => x && { ...x, habito: { ...(x.habito ?? ({} as never)), modo: novoModo, checklist } });
    await salvarHabito(d!.hoje, { modo: novoModo, checklist });
  }

  // Cartão grande do passo atual ------------------------------------------------
  function cartaoAtual(id: PassoId) {
    if (id === "sabedoria") {
      return (
        <Destaque
          chip={{ cor: corPilar(7), texto: "Provérbios e Salmos" }}
          canto="~10 min"
          rotulo="Sabedoria · ao acordar"
          titulo={sabedoria.referencia}
          texto="Leia devagar e guarde uma frase para o dia."
        >
          <div className="flex gap-2.5">
            <a href={linkBiblia(sabedoria.livro, sabedoria.capitulos[0])} target="_blank" rel="noreferrer" className="botao-secundario flex-1">
              Abrir texto <IconeExterno />
            </a>
            <button type="button" className="botao-primario flex-1" onClick={() => alternarChecklist("sabedoria")}>
              Marcar como lido
            </button>
          </div>
        </Destaque>
      );
    }
    if ((id === "aprender" || id === "paralela") && atual) {
      const passo = id === "aprender" ? "nucleo" : "paralela";
      const temaId = passo === "nucleo" ? atual.tema_nucleo_id : atual.tema_paralelo_id;
      const pilar = pilarDoTema(temaId);
      const andamento = emAndamento(passo);
      return (
        <Destaque
          chip={{ cor: corPilar(pilar?.numero), texto: pilar?.nome ?? "Trilha" }}
          canto="~30 min"
          rotulo={`${passo === "nucleo" ? "Aprender" : "Paralela"} · aula ${numeroAula(passo)}`}
          titulo={andamento?.titulo ?? (passo === "nucleo" ? atual.nucleo_titulo : atual.paralela_titulo)}
          texto={andamento ? "Continue de onde parou." : `Aula guiada sobre ${temaNome(temaId)?.toLowerCase() ?? "o tema do trimestre"}, com fontes legais.`}
        >
          <Link href={`/aula/nova/${passo}`} className="botao-primario">
            {andamento ? "Continuar aula" : "Começar aula"}
            <IconeSeta />
          </Link>
        </Destaque>
      );
    }
    if (id === "fixar") {
      return (
        <Destaque rotulo="Fixar · todos os pilares" titulo={`${pendentes} ${pendentes === 1 ? "cartão" : "cartões"}`} texto={`Cerca de ${Math.max(1, minutosRevisao(pendentes))} minutos. É o que mantém o que você já aprendeu.`}>
          <Link href="/revisar" className="botao-primario">
            Revisar agora
            <IconeSeta />
          </Link>
        </Destaque>
      );
    }
    return (
      <Destaque rotulo="Refletir · à noite" titulo="3 aprendizados" texto="Escreva de memória, sem consultar. É prática de recuperação.">
        <Link href="/diario" className="botao-primario">
          Escrever no diário
          <IconeSeta />
        </Link>
      </Destaque>
    );
  }

  function linha(id: PassoId) {
    const p = passos.find((x) => x.id === id)!;
    const numero = passos.filter((x) => !x.pular || x.id === "aprender").findIndex((x) => x.id === id) + 1;
    const ultimo = id === "refletir";
    const ehAtual = atualId === id;
    const rotulos: Record<PassoId, [string, string, string?]> = {
      sabedoria: ["Sabedoria", sabedoriaFeita ? `${sabedoria.referencia} · lido` : sabedoria.referencia],
      aprender: ["Aprender", minimo ? "A aula volta amanhã" : feitoNucleo ? "Aula do núcleo concluída" : (atual?.nucleo_titulo ?? "Sem trimestre ativo"), minimo ? undefined : "~30 min"],
      paralela: ["Paralela", feitoParalela ? "Concluída" : (atual?.paralela_titulo ?? ""), "~30 min"],
      fixar: ["Fixar", fixarFeito ? (d!.revisoesHoje ? `${d!.revisoesHoje} revisados hoje` : "Nada para revisar") : `${pendentes} cartões para revisar`, fixarFeito ? undefined : `~${Math.max(1, minutosRevisao(pendentes))} min`],
      refletir: ["Refletir", diarioCompleto ? "Diário escrito" : "3 aprendizados de memória", diarioCompleto ? undefined : "à noite"],
    };
    const [nomePasso, detalhe, canto] = rotulos[id];
    const destino: Record<PassoId, string | null> = { sabedoria: null, aprender: "/aula/nova/nucleo", paralela: "/aula/nova/paralela", fixar: "/revisar", refletir: "/diario" };
    const marcador = p.feito ? (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-texto text-fundo">
        <IconeCheck />
      </span>
    ) : p.pular ? (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-dashed border-texto-3 text-texto-3">–</span>
    ) : (
      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${ehAtual ? "border-2 border-texto" : "border-[1.5px] border-borda font-semibold text-texto-2"}`}>{numero}</span>
    );
    const conteudo = ehAtual ? (
      <div className="min-w-0 flex-1 pb-4">
        {cartaoAtual(id)}
      </div>
    ) : (
      <LinhaPasso nome={nomePasso} detalhe={detalhe} canto={canto} feito={p.feito || !!p.pular} href={p.pular ? null : destino[id]} />
    );
    return (
      <div key={id} className="flex gap-3.5">
        <div className="flex w-7 flex-none flex-col items-center">
          {marcador}
          {!ultimo && <span className={`my-1 min-h-3 w-0.5 flex-1 ${p.feito ? "bg-texto" : "bg-borda"}`} />}
        </div>
        {conteudo}
      </div>
    );
  }

  const meta = resumo.minutosTotais;
  const circ = 2 * Math.PI * 22;

  const tambemHoje = (
    <>
      <Link href="/habitos" className="cartao-ui flex flex-col gap-2 rounded-2xl p-3.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-texto-2">
          <Ponto cor={corPilar(0)} />
          Corpo
        </span>
        <span className="num text-[15px] font-semibold">
          {d.exercicioSemana} de {META_CORPO} min
        </span>
        <span className="h-1 overflow-hidden rounded-sm bg-superficie-2">
          <span className="block h-full" style={{ width: `${Math.min(100, (d.exercicioSemana / META_CORPO) * 100)}%`, background: corPilar(0) }} />
        </span>
        <span className="text-xs text-texto-2">{d.corpoRegistradoHoje ? "exercício na semana" : "registrar sono e exercício"}</span>
      </Link>
      <button type="button" onClick={() => alternarChecklist("audio")} aria-pressed={!!checklist.audio} className="cartao-ui flex cursor-pointer flex-col gap-2 rounded-2xl p-3.5 text-left">
        <span className="flex items-center justify-between gap-1.5 text-xs font-semibold text-texto-2">
          <span className="flex items-center gap-1.5">
            <Ponto cor={corPilar(8)} />
            Inglês
          </span>
          {checklist.audio && <IconeCheck className="text-ok" />}
        </span>
        <span className="text-[15px] font-semibold">Áudio · 20 min</span>
        <span className="text-xs leading-snug text-texto-2">6 Minute English, durante o exercício</span>
      </button>
    </>
  );

  return (
    <div className="flex flex-col gap-[18px] md:gap-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-texto-2 md:text-sm">
            {formatarData(d.hoje).split(",")[0].replace("-feira", "")}, {deDataLocal(d.hoje).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}
            {seq.dias > 0 && ` · ${seq.dias} ${seq.dias === 1 ? "dia seguido" : "dias seguidos"}`}
          </div>
          <h1 className="mt-1.5 font-serif text-[32px] leading-[1.1] font-medium tracking-[-0.015em] md:text-[46px]">{saudacao(nome)}</h1>
        </div>
        <div role="img" aria-label={`${feitos} de ${meta} minutos feitos hoje`} className="relative h-[52px] w-[52px] flex-none">
          <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="22" fill="none" stroke="var(--superficie-2)" strokeWidth="4" />
            <circle cx="26" cy="26" r="22" fill="none" stroke="var(--texto)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(Math.min(1, feitos / Math.max(1, meta)) * circ).toFixed(1)} ${circ.toFixed(1)}`} transform="rotate(-90 26 26)" />
          </svg>
          <span className="num absolute inset-0 flex flex-col items-center justify-center text-[13px] leading-none font-bold">
            {feitos}
            <span className="text-[10px] font-medium text-texto-2">/{meta} min</span>
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-[18px] md:flex-row md:items-start md:gap-6">
        <section aria-label="Sessão de hoje" className="flex flex-col md:flex-[2]">
          {!atualId && (
            <div className="cartao-destaque mb-4 flex flex-col gap-1">
              <div className="text-[13px] font-medium text-texto-2">Dia completo</div>
              <div className="titulo-cartao">Você fez o essencial de hoje.</div>
              <p className="text-[15px] text-texto-2">Amanhã a trilha continua de onde parou.</p>
            </div>
          )}
          {passos.map((p) => linha(p.id))}
        </section>

        <aside aria-label="Também hoje" className="flex flex-col gap-2.5 md:flex-1">
          <div className="rotulo hidden px-1 md:block">Também hoje</div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-1">{tambemHoje}</div>
          {amanhaParalela && atual && (
            <div className="cartao-ui hidden flex-col gap-1.5 rounded-2xl p-4 md:flex">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-texto-2">
                <Ponto cor={corPilar(pilarDoTema(atual.tema_paralelo_id)?.numero)} />
                Amanhã
              </span>
              <span className="text-base font-semibold">Paralela: {temaNome(atual.tema_paralelo_id) ?? atual.paralela_titulo}</span>
              <span className="text-[13px] text-texto-2">A meta do dia sobe para 90 min</span>
            </div>
          )}
        </aside>
      </div>

      <button type="button" role="switch" aria-checked={minimo} onClick={trocarModo} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-left">
        <span className="text-sm text-texto-2">
          <span className="font-semibold text-texto">Dia corrido?</span> Modo mínimo, 30 min
        </span>
        <span className={`relative h-[26px] w-11 flex-none rounded-[13px] ${minimo ? "bg-texto" : "bg-superficie-2"}`}>
          <span className="absolute top-[3px] h-5 w-5 rounded-full bg-superficie shadow-sm transition-all" style={{ left: minimo ? 21 : 3 }} />
        </span>
      </button>
    </div>
  );
}

function Destaque({ chip, canto, rotulo, titulo, texto, children }: { chip?: { cor: string; texto: string }; canto?: string; rotulo: string; titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <article className="cartao-destaque flex flex-col gap-3.5 md:gap-5 md:rounded-3xl md:p-8">
      {(chip || canto) && (
        <div className="flex items-center justify-between gap-2">
          {chip ? (
            <span className="chip">
              <Ponto cor={chip.cor} />
              {chip.texto}
            </span>
          ) : (
            <span />
          )}
          {canto && <span className="text-[13px] text-texto-2">{canto}</span>}
        </div>
      )}
      <div>
        <div className="text-[13px] font-medium text-texto-2">{rotulo}</div>
        <h2 className="titulo-cartao mt-1 md:text-[38px]">{titulo}</h2>
        <p className="mt-1.5 text-[15px] leading-normal text-texto-2 md:text-[17px]">{texto}</p>
      </div>
      {children}
    </article>
  );
}

function LinhaPasso({ nome, detalhe, canto, feito, href }: { nome: string; detalhe: string; canto?: string; feito: boolean; href: string | null }) {
  const corpo = (
    <>
      <span className="min-w-0">
        <span className={`block text-[15px] font-semibold ${feito ? "text-texto-2" : ""}`}>{nome}</span>
        <span className="mt-0.5 block truncate text-[13px] text-texto-2">{detalhe}</span>
      </span>
      {canto && <span className="flex-none text-[13px] text-texto-2">{canto}</span>}
    </>
  );
  const classe = "flex flex-1 justify-between gap-3 pt-1 pb-4 min-w-0";
  return href && !feito ? (
    <Link href={href} className={classe}>
      {corpo}
    </Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}
