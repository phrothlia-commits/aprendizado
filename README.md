# Trilha de Estudos

Plataforma pessoal de estudo contínuo e reforço de aprendizado. Responde a uma pergunta por dia: **"o que eu estudo e reviso hoje?"**

Especificação completa: documento "Plataforma de Trilha de Estudos — Especificação Completa" (out/2026), mantido fora do repositório por conter dados pessoais.

**Stack (opção A da seção 12):** Next.js 16 + TypeScript + Tailwind 4, Supabase (Postgres, autenticação e Row Level Security), PWA, deploy na Vercel. Agendamento com FSRS (`ts-fsrs`) e SM-2 como alternativa.

## Colocar no ar

### 1. Banco (Supabase), uma vez só

1. No painel do Supabase, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql) e clique em **Run**.
   Ele cria as 14 tabelas, liga o RLS em todas e cria as funções `semear`, `dias_ativos` e `tags_cartoes`. Pode rodar de novo sem perder dados.
   Depois, numa nova query, rode [`supabase/migrations/0002_ia.sql`](supabase/migrations/0002_ia.sql): tabelas da camada de IA (aulas, fontes, Tutor Feynman, registro de custos, biblioteca) e o bucket privado `biblioteca` no Storage, com RLS por pasta do usuário.
3. Em **Authentication → URL Configuration**, coloque a URL do deploy em *Site URL* (por exemplo `https://trilha.vercel.app`). Assim o link de confirmação do e-mail aponta para o app.

### 2. Rodar localmente

```bash
cp .env.example .env.local   # preencha URL e chave publishable do Supabase
npm install
npm run dev                  # http://localhost:3000
```

### 3. Primeiro acesso

1. Na tela de login, toque em **Criar conta**, confirme o e-mail e entre.
2. No primeiro login, o app carrega os seeds de `/seeds` no banco: 8 pilares + base física, 47 temas, 77 recursos, ciclo 1 com 8 trimestres, 6 idiomas e 116 cartões (16 da CF/88 e 100 de inglês).
3. **Depois de criar sua conta, desative novos cadastros:** *Authentication → Sign In / Providers → Allow new users to sign up* (desligar). O app é de um único usuário.

### 4. Deploy na Vercel

1. Importe o repositório na Vercel (o framework Next.js é detectado sozinho).
2. Em *Environment Variables*, cadastre `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `ANTHROPIC_API_KEY` (esta última **sem** o prefixo `NEXT_PUBLIC_`: ela só existe no servidor e nunca vai para o navegador).
3. Faça o deploy e, no celular, abra a URL e use **Adicionar à tela inicial** para instalar o PWA.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes do agendamento, da fila, da tela Hoje, dos seeds, do CSV, das rotas de IA, do parsing das respostas, da verificação de links e da extração da biblioteca |
| `npm run typecheck` / `npm run lint` | Checagens estáticas |
| `npm run build` | Build de produção |

## Organização

```
seeds/                      Conteúdo de estudo em JSON (edite aqui para repriorizar)
supabase/migrations/        Schema SQL com RLS
src/lib/agendamento/        FSRS e SM-2 atrás de uma interface única (sem UI, testável)
src/lib/fila.ts             Fila diária: limites, prioridade de vencidos, intercalação por pilar
src/lib/hoje.ts             Regras da tela Hoje: rotina, modo mínimo, sabedoria do dia, sequência
src/lib/seed.ts             Monta a carga inicial a partir de /seeds
src/lib/db.ts, src/lib/ia.ts Acesso ao Supabase e às rotas de IA a partir do navegador
src/app/                    Telas (abas Hoje, Trilha, Biblioteca, Você; fluxos de aula, revisão e Feynman)
src/app/api/                Rotas do servidor: aula, Feynman, busca de PDF legal, biblioteca
src/server/ia/              Pipeline de IA: busca, composição, custos, erros, schemas (só servidor)
src/server/fontes/          Lista de fontes legais e verificação de links
src/server/biblioteca/      Extração de PDF/EPUB/TXT/HTML/Kindle e download de obras abertas
prompts/                    Prompts de sistema, em português
```

## Camada de IA

Todas as chamadas à API do Claude acontecem no servidor, com `ANTHROPIC_API_KEY`. Modelo: Claude Opus 5.5, com o fallback do servidor ligado (se o modelo recusar por política, a própria API tenta um modelo alternativo).

- **Aula guiada:** botão "Começar aula" no passo Aprender. São duas chamadas: (1) busca na web restrita aos domínios legais de `src/server/fontes/dominios.ts`; (2) composição da aula em JSON validado por schema. A IA só cita fontes por identificador (S1, S2…, ou T1, T2… para trechos da sua biblioteca); os links vêm exclusivamente dos resultados da busca e cada um é verificado no servidor antes de aparecer. Link quebrado é descartado.
- **Fontes legais:** domínio público, acesso aberto, documentos oficiais e cursos gratuitos oficiais; para livros protegidos, só prévia, empréstimo, assinatura ou compra. Padrões de cópia pirata e arquivos de obras protegidas são descartados.
- **Busca de PDF legal:** restrita aos 16 domínios marcados para download (domínio público, acesso aberto, fontes oficiais). O botão "Adicionar à biblioteca" baixa só desses domínios, verificando cada redirecionamento.
- **Biblioteca:** arquivos no Storage privado; o texto é dividido em trechos com capítulo e página e indexado com busca full-text. A aula e o Tutor Feynman usam os trechos relevantes e citam capítulo e página.
- **Custos:** cada chamada é registrada (tokens, buscas, custo estimado). Gasto do mês e limite diário em Você › Configurações. Uma aula usa 2 chamadas; Feynman e busca de PDF, 1.

Decisões de modelagem que vale conhecer:

- **Sabedoria do dia:** rodízio de 61 dias a partir de 01/10/2026: Provérbios 1 a 31 (um capítulo por dia), depois Salmos 1 a 150 (5 por dia).
- **Blocos acoplados** (`"acoplado": true` em `seeds/rotina.json`) aparecem no checklist, mas ficam fora da meta de minutos e da barra de progresso.
- **Trilha paralela:** aparece no checklist às terças, quintas e sábados (`dias_semana` em `seeds/rotina.json`).
- **Sequência:** um dia conta se houve revisão, diário, item do checklist ou sessão de estudo.
- **Reordenar a fila de trimestres** troca núcleo e paralela entre dois trimestres futuros; as datas ficam e nenhum tema é removido.
- **Avançar de nível** num tema só é liberado depois do critério Feynman (explicação de pelo menos 30 palavras escrita sem consultar).

## Fase 1: resumo

**Feito**

- [x] Stack confirmada (opção A)
- [x] Schema, RLS e autenticação (testados num Postgres 16 local: migração idempotente e isolamento entre usuários)
- [x] Seeds JSON (pilares, temas, recursos, ciclo 1, idiomas, cartões iniciais)
- [x] Módulo de agendamento FSRS + SM-2 com testes
- [x] Tela Revisar (frente → verso, 4 botões com prévia do intervalo, atalhos 1–4, filtro por pilar, registro de cada revisão com tempo de resposta)
- [x] Tela Cartões (criar, editar, buscar, filtrar por pilar e tag, suspender, excluir, importar e exportar CSV)
- [x] Tela Trilha (cronograma com reordenação, pilares e temas com nível, status e critério Feynman, idiomas)
- [x] Tela Diário (3 aprendizados, tags, histórico pesquisável)
- [x] Tela Hoje com modo mínimo, sequência, núcleo/paralela, sabedoria e checklist
- [x] Exportação completa em JSON e CSV por tabela
- [x] PWA instalável (manifest, ícones, service worker)
- [ ] Deploy na Vercel e teste no seu celular (depende da sua conta)

**Validação:** 49 testes automatizados; teste ponta a ponta no Chromium (celular e desktop, claro e escuro) contra Postgres + PostgREST locais com o mesmo SQL: login, Hoje em ~170 ms, modo mínimo, 12 revisões, criação de cartão, reordenação de trimestre, diário com busca e exportação. Nenhum erro no console.

**Pendências e riscos**

- Revisão **offline** com sincronização posterior (marcada como "desejável" na especificação) não foi feita. Hoje o app abre offline, mas precisa de rede para carregar e salvar dados.
- Os 100 cartões de inglês seguem a **ordem aproximada** da NGSL, sem as palavras gramaticais. Para a lista oficial completa, importe o CSV da NGSL na tela Cartões.
- **Carga diária (decidida após a Fase 1):** a meta conta só o tempo dedicado: sabedoria 10 + cartões 15 + núcleo 30 + diário 5 = **60 min**, e **90 min** nos dias de trilha paralela (ter, qui, sáb). Áudio em inglês no trajeto (20 min) e leitura livre antes de dormir (15 min, opcional) aparecem no checklist como blocos *acoplados* e não somam na meta. O modo mínimo continua em 30 min.
- Siga o próprio risco nº 1 da especificação: use a Fase 1 por **30 dias** antes de pedir a Fase 2.

**Próxima fase (2):** Biblioteca, Prática, Hábitos, Progresso (retenção, horas por pilar, alerta de pilar parado há 12 meses) e roteiro guiado da revisão semanal. As tabelas já existem no schema.
