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
   Por fim, rode [`supabase/migrations/0003_ia_otimizacao.sql`](supabase/migrations/0003_ia_otimizacao.sql): modelo por etapa, teto mensal, número de buscas e nível em `configuracoes`; tabelas `geracoes` (checkpoints e idempotência), `fontes_tema` (cache de fontes) e `ia_dominios_bloqueados`; colunas novas em `ia_chamadas` (etapa, duração, detalhe do erro, reaproveitamento, economia) e a função `painel_ia`. As três migrações são idempotentes.
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

**Situação atual:** o app está no ar (branch `main` na Vercel), com `ANTHROPIC_API_KEY` cadastrada em Production e Preview e as migrações 0001 e 0002 aplicadas. A partir de agora, toda mudança entra por branch e pull request, nunca direto na `main`: cada PR ganha um link de preview da Vercel para testar antes do merge.

Para quem for montar do zero:

1. Importe o repositório na Vercel (o framework Next.js é detectado sozinho).
2. Em *Environment Variables*, cadastre `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `ANTHROPIC_API_KEY` (esta última **sem** o prefixo `NEXT_PUBLIC_`: ela só existe no servidor e nunca vai para o navegador).
3. Faça o deploy e, no celular, abra a URL e use **Adicionar à tela inicial** para instalar o PWA.
4. Confira de novo que **Allow new users to sign up** está desligado no Supabase (*Authentication → Sign In / Providers*). Com o cadastro aberto, qualquer pessoa com o link criaria conta e poderia gastar a sua chave da API dentro dos limites da conta dela.

### 5. Domínios fora da busca na web

Alguns domínios da lista legal não são acessíveis ao rastreador da Anthropic, e a API recusa a busca inteira (erro 400) se um deles estiver em `allowed_domains`. Eles continuam valendo para classificar links que chegam por outro caminho, mas não entram na busca:

- **Lista fixa** (`FORA_DA_BUSCA` em `src/server/fontes/dominios.ts`): `bbc.co.uk`.
- **Lista automática** (tabela `ia_dominios_bloqueados`): quando a API recusa um domínio, o servidor registra o domínio (com data e contagem), tenta a busca de novo **uma** vez sem ele e o exclui das buscas seguintes. Para devolver um domínio à busca, apague a linha dele na tabela.

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
src/app/api/                Rotas do servidor: aula (com progresso), status, explicar, Feynman, busca de PDF legal, biblioteca
src/server/ia/              Pipeline de IA: modelos, chamadas, busca, conferência, perfil, custos, erros, schemas (só servidor)
src/server/fontes/          Lista de fontes legais e verificação de links
src/server/biblioteca/      Extração de PDF/EPUB/TXT/HTML/Kindle e download de obras abertas
prompts/                    Prompts de sistema, em português
```

## Camada de IA

Todas as chamadas à API do Claude acontecem no servidor, com `ANTHROPIC_API_KEY` (nunca em `NEXT_PUBLIC_*`, nunca no navegador nem nos logs). Os ids de modelo ficam num só arquivo, `src/server/ia/modelos.ts`.

**Modelo por etapa** (Você › Configurações):

| Etapa | Padrão | Opções |
|---|---|---|
| Pesquisa de fontes (busca na web) | Claude Sonnet 5.5 | Opus 5.5 |
| Composição da aula | Claude Sonnet 5.5 | Opus 5.5 (mais profundidade, cerca do dobro do custo) |
| Tutor Feynman | Claude Sonnet 5.5 | Opus 5.5, Haiku 5.5 |
| Explicar de outro jeito | Claude Haiku 5.5 | Sonnet 5.5 |
| Reparo do formato (JSON) | Claude Haiku 5.5 | Sonnet 5.5 |

Sonnet e Opus usam o fallback do servidor (`fallbacks: "default"`): se o modelo recusar por política, a própria API tenta outro. O Haiku 5.5 não tem esse recurso.

**Como uma aula é gerada**

1. **Biblioteca primeiro:** busca full-text nos seus trechos. Havendo trechos da obra-base do tema, eles viram a fonte principal e a busca na web cai para no máximo 2 usos.
2. **Fontes:** se o tema tem fontes guardadas há menos de 30 dias, cada link é reverificado por HTTP (sem IA) e, com 3 ou mais válidos, a busca na web é pulada. Senão, busca restrita aos domínios legais, com no máximo 3 usos (configurável) e `allowed_domains` sempre presente. "Buscar novas fontes" (ao tentar de novo) ignora o cache.
3. **Composição:** saída estruturada (`output_config.format`) validada com zod no servidor. A parte fixa do prompt (metodologia, regras de fontes, formato e o perfil do aluno) vem primeiro e é marcada para cache; o pedido do dia vai no fim. O perfil (até ~300 palavras, montado sem IA) traz nível declarado, aulas concluídas do tema, cartões que você mais erra, lacunas do Feynman e perguntas do pré-teste que você marcou como erradas. O pedido inclui as 2 últimas aulas e o que vem depois na trilha.
4. **Conferência automática (sem IA):** objetivo, pré-teste, cada bloco com citação e pergunta de recuperação, citações apontando para fontes verificadas, 3 a 8 cartões com pelo menos um "por quê?" e nenhum link fora da lista. O que dá para corrigir sem IA é corrigido; o resto vai em **uma** chamada de correção só com os itens que falharam (mesmo modelo e mesma parte fixa, que sai do cache).
5. **Cartões:** um conceito por cartão; os que repetem cartões que você já tem (similaridade de texto no servidor) são retirados.

**Robustez e custo**

- **Erros:** mensagem em português nomeando a etapa (pesquisa, verificação de links, composição, conferência, Feynman, biblioteca). O detalhe técnico (status, tipo, mensagem, request_id, modelo, etapa) vai para o log do servidor e para `ia_chamadas.erro_detalhe`; os últimos erros aparecem em Você › Configurações.
- **JSON fora do formato:** no máximo **uma** chamada de reparo (Haiku), enviando só os erros de validação e o JSON recebido.
- **Checkpoints:** cada etapa paga fica guardada em `geracoes`. "Tentar de novo" retoma da etapa que falhou.
- **Idempotência:** cada geração tem um id; duplo clique, recarga ou duas abas não disparam uma segunda geração (a outra aba acompanha o progresso pelo status).
- **Progresso real:** a tela mostra "Pesquisando fontes", "Verificando links", "Escrevendo a aula" e "Conferindo", transmitidos pelo servidor; todas as chamadas usam streaming.
- **Reabrir aula** nunca chama a API; "Explicar de outro jeito" fica guardado na aula depois da primeira vez.
- **Limites:** limite diário de chamadas e teto mensal em dólares (padrão US$ 15), conferidos **antes** de cada chamada, inclusive reparo, correção, Feynman, Explicar e busca de PDF. Aviso a partir de 80%; bloqueio em 100% até você aumentar o teto.
- **Medição:** cada chamada registra etapa, modelo, tokens de entrada e saída, tokens lidos do cache, buscas, custo, duração, sucesso/erro e se foi reaproveitamento. Você › Configurações mostra gasto do mês, custo médio por aula, taxa de sucesso das gerações e economia (cache de prompt e reaproveitamentos).

- **Fontes legais:** domínio público, acesso aberto, documentos oficiais e cursos gratuitos oficiais; para livros protegidos, só prévia, empréstimo, assinatura ou compra. Padrões de cópia pirata e arquivos de obras protegidas são descartados. A IA só cita fontes por identificador (S1, T1…); os links vêm dos resultados da busca e cada um é verificado no servidor.
- **Busca de PDF legal:** restrita aos domínios marcados para download (domínio público, acesso aberto, fontes oficiais). O botão "Adicionar à biblioteca" baixa só desses domínios, verificando cada redirecionamento.
- **Biblioteca:** arquivos no Storage privado; o texto é dividido em trechos com capítulo e página e indexado com busca full-text.

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
