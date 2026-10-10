-- Camada de IA (MVP): aulas guiadas, fontes, Tutor Feynman, registro de custos,
-- base física e biblioteca pessoal. Executar depois de 0001_schema.sql.
-- Idempotente: pode ser executado mais de uma vez.

-- Configurações -----------------------------------------------------------------
alter table public.configuracoes
  add column if not exists ia_limite_diario int not null default 20 check (ia_limite_diario between 0 and 500);

-- Base física ---------------------------------------------------------------------
alter table public.habitos add column if not exists tipo_exercicio text;

-- Aulas guiadas -------------------------------------------------------------------
create table if not exists public.aulas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  trimestre_id uuid references public.trimestres on delete set null,
  tema_id uuid references public.temas on delete set null,
  passo text not null check (passo in ('nucleo', 'paralela')),
  titulo text not null,
  conteudo jsonb not null,            -- objetivo, pré-teste, blocos, cartões propostos
  respostas jsonb not null default '{}', -- respostas do usuário ao pré-teste e às perguntas
  cartoes_resolvidos jsonb not null default '[]', -- índices de cartões aprovados/descartados
  usou_biblioteca boolean not null default false,
  modelo text,
  estudada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists aulas_user_idx on public.aulas (user_id, created_at desc);

-- Fontes externas (somente links encontrados pela busca e verificados) --------------
create table if not exists public.fontes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  aula_id uuid references public.aulas on delete set null,
  tema_id uuid references public.temas on delete set null,
  tipo text not null check (tipo in ('texto', 'video', 'audio', 'curso', 'lei')),
  categoria text not null check (categoria in ('dominio_publico', 'acesso_aberto', 'oficial', 'curso_gratuito', 'protegido_legal')),
  titulo text not null,
  autor text,
  url text not null,
  gratuita boolean not null,
  acesso text,                        -- ex.: "domínio público", "prévia oficial", "compra"
  permite_download boolean not null default false,
  verificado_em timestamptz not null default now(),
  consumido boolean not null default false,
  consumido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, url)
);

-- Tutor Feynman ----------------------------------------------------------------------
create table if not exists public.feynman (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tema_id uuid not null references public.temas on delete cascade,
  explicacao text not null,
  avaliacao jsonb not null,           -- correto, lacunas, erros, perguntas, cartões sugeridos
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feynman_tema_idx on public.feynman (user_id, tema_id, created_at desc);

-- Registro de chamadas à API (custo e limite diário) ------------------------------------
create table if not exists public.ia_chamadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  funcao text not null,               -- aula_pesquisa, aula_composicao, feynman
  modelo text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_leitura_tokens int not null default 0,
  cache_escrita_tokens int not null default 0,
  buscas_web int not null default 0,
  custo_usd numeric(10, 4) not null default 0,
  sucesso boolean not null default true,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ia_chamadas_data_idx on public.ia_chamadas (user_id, created_at desc);

-- Biblioteca pessoal ---------------------------------------------------------------------
create table if not exists public.biblioteca_arquivos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  recurso_id uuid references public.recursos on delete set null,
  titulo text not null,
  autor text,
  formato text not null check (formato in ('pdf', 'epub', 'txt', 'kindle', 'html')),
  caminho text not null,              -- caminho no bucket "biblioteca": <user_id>/<arquivo>
  tamanho_bytes bigint,
  origem text not null default 'upload' check (origem in ('upload', 'fonte_aberta')),
  fonte_url text,
  status text not null default 'processando' check (status in ('processando', 'pronto', 'erro')),
  erro text,
  total_trechos int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.biblioteca_trechos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  arquivo_id uuid not null references public.biblioteca_arquivos on delete cascade,
  ordem int not null,
  capitulo text,
  pagina int,
  texto text not null,
  busca tsvector generated always as (to_tsvector('simple', coalesce(capitulo, '') || ' ' || texto)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trechos_busca_idx on public.biblioteca_trechos using gin (busca);
create index if not exists trechos_arquivo_idx on public.biblioteca_trechos (arquivo_id, ordem);

-- RLS e updated_at nas tabelas novas -------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['aulas', 'fontes', 'feynman', 'ia_chamadas', 'biblioteca_arquivos', 'biblioteca_trechos'] loop
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

-- Busca nos trechos da biblioteca ------------------------------------------------------------
create or replace function public.buscar_trechos(consulta text, arquivos uuid[] default null, limite int default 8)
returns table (id uuid, arquivo_id uuid, titulo text, autor text, capitulo text, pagina int, texto text, rank real)
language sql stable security invoker set search_path = public as $$
  with q as (
    -- Termos unidos por OR: a aula busca por vários conceitos ao mesmo tempo.
    select to_tsquery('simple', string_agg(quote_literal(t) || ':*', ' | ')) as tsq
    from unnest(regexp_split_to_array(lower(consulta), '[^[:alnum:]]+')) as t
    where length(t) >= 3
  )
  select tr.id, tr.arquivo_id, a.titulo, a.autor, tr.capitulo, tr.pagina, tr.texto, ts_rank(tr.busca, q.tsq) as rank
  from biblioteca_trechos tr
  join biblioteca_arquivos a on a.id = tr.arquivo_id
  cross join q
  where tr.user_id = auth.uid()
    and q.tsq is not null
    and tr.busca @@ q.tsq
    and (arquivos is null or tr.arquivo_id = any(arquivos))
  order by rank desc
  limit greatest(1, least(limite, 30));
$$;
grant execute on function public.buscar_trechos(text, uuid[], int) to authenticated;

-- Custo do mês e chamadas de hoje (tela Mais e limite diário) ---------------------------------
create or replace function public.resumo_ia(fuso text default 'America/Sao_Paulo')
returns table (chamadas_hoje bigint, custo_mes numeric, chamadas_mes bigint, custo_hoje numeric)
language sql stable security invoker set search_path = public as $$
  select
    count(*) filter (where (created_at at time zone fuso)::date = (now() at time zone fuso)::date),
    coalesce(sum(custo_usd) filter (where date_trunc('month', created_at at time zone fuso) = date_trunc('month', now() at time zone fuso)), 0),
    count(*) filter (where date_trunc('month', created_at at time zone fuso) = date_trunc('month', now() at time zone fuso)),
    coalesce(sum(custo_usd) filter (where (created_at at time zone fuso)::date = (now() at time zone fuso)::date), 0)
  from ia_chamadas where user_id = auth.uid();
$$;
grant execute on function public.resumo_ia(text) to authenticated;

-- Dias ativos passam a contar sessões de estudo (aulas concluídas já gravam sessão) e hábitos
-- registrados. A função de 0001 já considera sessoes_estudo e habitos com checklist.

-- Supabase Storage: bucket privado "biblioteca", cada usuário só acessa a própria pasta ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('biblioteca', 'biblioteca', false, 52428800)
on conflict (id) do update set public = false;

drop policy if exists "biblioteca_ler" on storage.objects;
drop policy if exists "biblioteca_enviar" on storage.objects;
drop policy if exists "biblioteca_atualizar" on storage.objects;
drop policy if exists "biblioteca_apagar" on storage.objects;

create policy "biblioteca_ler" on storage.objects for select to authenticated
  using (bucket_id = 'biblioteca' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "biblioteca_enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'biblioteca' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "biblioteca_atualizar" on storage.objects for update to authenticated
  using (bucket_id = 'biblioteca' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "biblioteca_apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'biblioteca' and (storage.foldername(name))[1] = (select auth.uid())::text);
