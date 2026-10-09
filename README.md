# Trilha de Estudos

Plataforma pessoal de estudo contínuo e reforço de aprendizado. Responde a uma pergunta por dia: **"o que eu estudo e reviso hoje?"**

Especificação completa: documento "Plataforma de Trilha de Estudos — Especificação Completa" (out/2026), mantido fora do repositório por conter dados pessoais.

**Stack (opção A da seção 12):** Next.js 16 + TypeScript + Tailwind 4, Supabase (Postgres, autenticação e Row Level Security), PWA, deploy na Vercel. Agendamento com FSRS (`ts-fsrs`) e SM-2 como alternativa.

## Colocar no ar

### 1. Banco (Supabase), uma vez só

1. No painel do Supabase, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql) e clique em **Run**.
   Ele cria as 14 tabelas, liga o RLS em todas e cria as funções `semear`, `dias_ativos` e `tags_cartoes`. Pode rodar de novo sem perder dados.
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
2. Em *Environment Variables*, cadastre `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Faça o deploy e, no celular, abra a URL e use **Adicionar à tela inicial** para instalar o PWA.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes do agendamento, da fila, da tela Hoje, dos seeds e do CSV |
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
src/lib/db.ts               Acesso ao Supabase
src/app/                    Telas: Hoje, Revisar, Trilha, Cartões, Diário, Mais
```

Decisões de modelagem que vale conhecer:

- **Sabedoria do dia:** rodízio de 61 dias a partir de 01/10/2026: Provérbios 1 a 31 (um capítulo por dia), depois Salmos 1 a 150 (5 por dia).
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

**Validação:** 48 testes automatizados; teste ponta a ponta no Chromium (celular e desktop, claro e escuro) contra Postgres + PostgREST locais com o mesmo SQL: login, Hoje em ~170 ms, modo mínimo, 12 revisões, criação de cartão, reordenação de trimestre, diário com busca e exportação. Nenhum erro no console.

**Pendências e riscos**

- Revisão **offline** com sincronização posterior (marcada como "desejável" na especificação) não foi feita. Hoje o app abre offline, mas precisa de rede para carregar e salvar dados.
- Os 100 cartões de inglês seguem a **ordem aproximada** da NGSL, sem as palavras gramaticais. Para a lista oficial completa, importe o CSV da NGSL na tela Cartões.
- A tabela de rotina da seção 7 soma **95 a 130 min por dia**, não os 75 a 90 min indicados no texto. O app usa os tempos mínimos de cada bloco: 95 min, ou 125 min nos dias de trilha paralela. Ajuste em `seeds/rotina.json` se quiser outra carga.
- Siga o próprio risco nº 1 da especificação: use a Fase 1 por **30 dias** antes de pedir a Fase 2.

**Próxima fase (2):** Biblioteca, Prática, Hábitos, Progresso (retenção, horas por pilar, alerta de pilar parado há 12 meses) e roteiro guiado da revisão semanal. As tabelas já existem no schema.
