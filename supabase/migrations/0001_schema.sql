-- Plataforma de Trilha de Estudos — schema inicial (seção 11 da especificação)
-- Executar uma vez no SQL Editor do Supabase (ou via `supabase db push`).
-- Todas as tabelas têm RLS: cada linha pertence a um usuário (auth.uid()).

create extension if not exists pgcrypto;

-- updated_at automático ----------------------------------------------------
create or replace function public.tocar_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Configurações do usuário --------------------------------------------------
create table if not exists public.configuracoes (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  novos_por_dia int not null default 10 check (novos_por_dia between 0 and 500),
  revisoes_por_dia int not null default 150 check (revisoes_por_dia between 0 and 2000),
  algoritmo text not null default 'fsrs' check (algoritmo in ('fsrs', 'sm2')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pilares e temas -------------------------------------------------------------
create table if not exists public.pilares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  numero int not null,
  slug text not null,
  nome text not null,
  prioridade text not null check (prioridade in ('A', 'B', 'C', 'continua')),
  cor text,
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, numero),
  unique (user_id, slug)
);

create table if not exists public.temas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  pilar_id uuid not null references public.pilares on delete cascade,
  slug text not null,
  nome text not null,
  nivel text not null default 'fundamentos' check (nivel in ('fundamentos', 'intermediario', 'avancado')),
  status text not null default 'fila' check (status in ('fila', 'ativo', 'concluido_no_nivel')),
  feynman_ok boolean not null default false,
  explicacao_feynman text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

-- Cronograma em espiral ---------------------------------------------------------
create table if not exists public.ciclos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  numero int not null,
  nivel text not null check (nivel in ('fundamentos', 'intermediario', 'avancado')),
  data_inicio date not null,
  data_fim date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, numero)
);

create table if not exists public.trimestres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  ciclo_id uuid not null references public.ciclos on delete cascade,
  ordem int not null,
  periodo text not null,
  data_inicio date not null,
  data_fim date not null,
  nucleo_titulo text not null,
  tema_nucleo_id uuid references public.temas on delete set null,
  paralela_titulo text not null,
  tema_paralelo_id uuid references public.temas on delete set null,
  idiomas_foco text,
  notas_revisao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Recursos (livros, cursos...) --------------------------------------------------
create table if not exists public.recursos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  titulo text not null,
  autor text,
  tipo text not null check (tipo in ('livro', 'curso', 'video', 'podcast', 'lei')),
  url text,
  pilar_id uuid references public.pilares on delete set null,
  tema_id uuid references public.temas on delete set null,
  status text not null default 'quero_ler' check (status in ('quero_ler', 'lendo', 'concluido')),
  anotacoes text,
  concluido_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cartões e revisões --------------------------------------------------------------
create table if not exists public.cartoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  frente text not null,
  verso text not null,
  tipo text not null default 'basico' check (tipo in ('basico', 'por_que', 'idioma')),
  pilar_id uuid references public.pilares on delete set null,
  tema_id uuid references public.temas on delete set null,
  tags text[] not null default '{}',
  fonte text,
  origem text not null default 'manual' check (origem in ('manual', 'seed', 'importado', 'ia')),
  agendamento jsonb,                -- estado serializado do FSRS / SM-2
  proxima_revisao timestamptz,      -- null = cartão novo, ainda não estudado
  posicao bigint generated always as identity, -- ordem de entrada dos cartões novos
  suspenso boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cartoes_fila_idx on public.cartoes (user_id, proxima_revisao) where not suspenso;
create index if not exists cartoes_novos_idx on public.cartoes (user_id, posicao) where proxima_revisao is null and not suspenso;

create table if not exists public.revisoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  cartao_id uuid not null references public.cartoes on delete cascade,
  revisado_em timestamptz not null default now(),
  botao smallint not null check (botao between 1 and 4), -- 1 Errei, 2 Difícil, 3 Bom, 4 Fácil
  tempo_resposta_ms int,
  intervalo_anterior real,  -- dias
  intervalo_novo real,      -- dias
  era_novo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists revisoes_data_idx on public.revisoes (user_id, revisado_em);

-- Registros diários -----------------------------------------------------------------
create table if not exists public.sessoes_estudo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  pilar_id uuid references public.pilares on delete set null,
  tema_id uuid references public.temas on delete set null,
  minutos int not null check (minutos > 0),
  tipo text not null check (tipo in ('nucleo', 'paralela', 'leitura_livre', 'idioma')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.diarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  aprendizado_1 text,
  aprendizado_2 text,
  aprendizado_3 text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, data)
);

create table if not exists public.praticas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  semana date not null, -- segunda-feira da semana
  area text not null check (area in ('social', 'oratoria', 'negociacao', 'idioma', 'humor')),
  meta text,
  o_que_fiz text,
  o_que_aprendi text,
  avaliacao smallint check (avaliacao between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.habitos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  horas_sono numeric(3, 1),
  minutos_exercicio int,
  novidade text,
  modo text not null default 'padrao' check (modo in ('padrao', 'minimo')),
  checklist jsonb not null default '{}', -- { "<id do item da rotina>": true }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, data)
);

create table if not exists public.idiomas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nome text not null,
  nivel_atual text not null default 'A0',
  meta text not null,
  ambicao text,
  motivo text,
  horas_acumuladas numeric(7, 1) not null default 0,
  marcos jsonb not null default '[]',
  status text not null default 'fila' check (status in ('ativo', 'passivo', 'fila')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, nome)
);

create table if not exists public.passagens_sabedoria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  livro text not null check (livro in ('Provérbios', 'Salmos', 'outro')),
  referencia text not null,
  data_lida date not null,
  anotacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, data_lida, referencia)
);

-- RLS e triggers em todas as tabelas -----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'configuracoes', 'pilares', 'temas', 'ciclos', 'trimestres', 'recursos', 'cartoes',
    'revisoes', 'sessoes_estudo', 'diarios', 'praticas', 'habitos', 'idiomas', 'passagens_sabedoria'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists dono on public.%I', t);
    execute format(
      'create policy dono on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t);
    execute format('drop trigger if exists tocar_updated_at on public.%I', t);
    execute format(
      'create trigger tocar_updated_at before update on public.%I for each row execute function public.tocar_updated_at()',
      t);
  end loop;
end $$;

-- Dias com atividade (para a sequência), no fuso do usuário ---------------------------
create or replace function public.dias_ativos(fuso text default 'America/Sao_Paulo', desde date default null)
returns setof date
language sql stable security invoker set search_path = public as $$
  select distinct d from (
    select (revisado_em at time zone fuso)::date as d from revisoes where user_id = auth.uid()
    union all
    select data from diarios where user_id = auth.uid()
      and coalesce(aprendizado_1, aprendizado_2, aprendizado_3) is not null
    union all
    select data from habitos where user_id = auth.uid() and checklist <> '{}'::jsonb
    union all
    select data from sessoes_estudo where user_id = auth.uid()
  ) x
  where desde is null or d >= desde
  order by d desc;
$$;

-- Tags distintas dos cartões (filtro da tela Cartões) ---------------------------------
create or replace function public.tags_cartoes()
returns setof text
language sql stable security invoker set search_path = public as $$
  select distinct unnest(tags) as t from cartoes where user_id = auth.uid() order by 1;
$$;

-- Carga inicial (seeds JSON), atômica e idempotente ----------------------------------
-- Recebe o payload montado pelo app a partir de /seeds e só executa se o usuário
-- ainda não tiver pilares. Retorna true se semeou.
create or replace function public.semear(payload jsonb)
returns boolean
language plpgsql security invoker set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if exists (select 1 from pilares where user_id = uid) then return false; end if;

  insert into configuracoes (user_id) values (uid) on conflict do nothing;

  insert into pilares (id, numero, slug, nome, prioridade, cor, descricao)
  select id, numero, slug, nome, prioridade, cor, descricao
  from jsonb_to_recordset(payload -> 'pilares')
    as x(id uuid, numero int, slug text, nome text, prioridade text, cor text, descricao text);

  insert into temas (id, pilar_id, slug, nome, nivel, status)
  select id, pilar_id, slug, nome, nivel, status
  from jsonb_to_recordset(payload -> 'temas')
    as x(id uuid, pilar_id uuid, slug text, nome text, nivel text, status text);

  insert into recursos (titulo, autor, tipo, url, pilar_id, tema_id, anotacoes)
  select titulo, autor, tipo, url, pilar_id, tema_id, anotacoes
  from jsonb_to_recordset(payload -> 'recursos')
    as x(titulo text, autor text, tipo text, url text, pilar_id uuid, tema_id uuid, anotacoes text);

  insert into ciclos (id, numero, nivel, data_inicio, data_fim)
  select id, numero, nivel, data_inicio, data_fim
  from jsonb_to_recordset(payload -> 'ciclos')
    as x(id uuid, numero int, nivel text, data_inicio date, data_fim date);

  insert into trimestres (ciclo_id, ordem, periodo, data_inicio, data_fim, nucleo_titulo, tema_nucleo_id,
                          paralela_titulo, tema_paralelo_id, idiomas_foco)
  select ciclo_id, ordem, periodo, data_inicio, data_fim, nucleo_titulo, tema_nucleo_id,
         paralela_titulo, tema_paralelo_id, idiomas_foco
  from jsonb_to_recordset(payload -> 'trimestres')
    as x(ciclo_id uuid, ordem int, periodo text, data_inicio date, data_fim date, nucleo_titulo text,
         tema_nucleo_id uuid, paralela_titulo text, tema_paralelo_id uuid, idiomas_foco text);

  insert into idiomas (nome, nivel_atual, meta, ambicao, motivo, marcos, status)
  select nome, nivel_atual, meta, ambicao, motivo, coalesce(marcos, '[]'::jsonb), status
  from jsonb_to_recordset(payload -> 'idiomas')
    as x(nome text, nivel_atual text, meta text, ambicao text, motivo text, marcos jsonb, status text);

  -- Cartões entram na ordem do array (define a fila de novos).
  insert into cartoes (frente, verso, tipo, pilar_id, tema_id, tags, fonte, origem)
  select c ->> 'frente', c ->> 'verso', c ->> 'tipo', (c ->> 'pilar_id')::uuid, (c ->> 'tema_id')::uuid,
         array(select jsonb_array_elements_text(coalesce(c -> 'tags', '[]'::jsonb))), c ->> 'fonte', 'seed'
  from jsonb_array_elements(payload -> 'cartoes') with ordinality as e(c, ord)
  order by ord;

  return true;
end $$;

grant execute on function public.semear(jsonb) to authenticated;
grant execute on function public.dias_ativos(text, date) to authenticated;
grant execute on function public.tags_cartoes() to authenticated;
