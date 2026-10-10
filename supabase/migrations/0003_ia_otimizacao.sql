-- Otimização da camada de IA: modelos por etapa, teto mensal, checkpoints e idempotência
-- das gerações, cache de fontes por tema, domínios bloqueados pela busca e registro
-- detalhado de cada chamada. Executar depois de 0002_ia.sql.
-- Idempotente: pode ser executado mais de uma vez.

-- Configurações -----------------------------------------------------------------------
alter table public.configuracoes
  add column if not exists ia_modelo_pesquisa text not null default 'claude-sonnet-5-5',
  add column if not exists ia_modelo_composicao text not null default 'claude-sonnet-5-5',
  add column if not exists ia_modelo_feynman text not null default 'claude-sonnet-5-5',
  add column if not exists ia_modelo_explicar text not null default 'claude-haiku-5-5',
  add column if not exists ia_modelo_reparo text not null default 'claude-haiku-5-5',
  add column if not exists ia_max_buscas int not null default 3,
  add column if not exists ia_teto_mensal_usd numeric(10, 2) not null default 15,
  add column if not exists ia_nivel text not null default 'iniciante';

do $$
begin
  alter table public.configuracoes drop constraint if exists configuracoes_ia_max_buscas_check;
  alter table public.configuracoes add constraint configuracoes_ia_max_buscas_check check (ia_max_buscas between 1 and 10);
  alter table public.configuracoes drop constraint if exists configuracoes_ia_teto_mensal_check;
  alter table public.configuracoes add constraint configuracoes_ia_teto_mensal_check check (ia_teto_mensal_usd between 0 and 1000);
  alter table public.configuracoes drop constraint if exists configuracoes_ia_nivel_check;
  alter table public.configuracoes add constraint configuracoes_ia_nivel_check check (ia_nivel in ('iniciante', 'intermediario', 'avancado'));
end $$;

-- Registro de chamadas: etapa, duração, detalhe do erro, reaproveitamento e economia ----------
alter table public.ia_chamadas
  add column if not exists etapa text,
  add column if not exists duracao_ms int,
  add column if not exists erro_detalhe jsonb,
  add column if not exists reaproveitado boolean not null default false,
  add column if not exists economia_usd numeric(10, 4) not null default 0,
  add column if not exists geracao_id uuid;
create index if not exists ia_chamadas_geracao_idx on public.ia_chamadas (geracao_id);

-- Gerações de aula: idempotência e checkpoints por etapa ------------------------------------
-- O id vem do navegador (um por clique em "gerar"); só existe uma geração aberta por passo.
create table if not exists public.geracoes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  trimestre_id uuid not null references public.trimestres on delete cascade,
  passo text not null check (passo in ('nucleo', 'paralela')),
  status text not null default 'pendente'
    check (status in ('pendente', 'pesquisa', 'verificacao', 'composicao', 'conferencia', 'concluida', 'erro')),
  etapa_falha text,
  checkpoint jsonb not null default '{}',  -- trechos, fontes, aula da IA: o que já foi pago
  erro jsonb,
  aula_id uuid references public.aulas on delete set null,
  em_execucao_ate timestamptz,              -- trava: outra aba/clique não dispara uma segunda geração
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists geracoes_aberta_idx on public.geracoes (user_id, trimestre_id, passo) where status <> 'concluida';
create index if not exists geracoes_user_idx on public.geracoes (user_id, created_at desc);

-- Cache de fontes por tema (links reverificados por HTTP antes de reaproveitar) ----------------
create table if not exists public.fontes_tema (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  chave text not null,                      -- tema_id ou trimestre:passo
  fontes jsonb not null,
  custo_usd numeric(10, 4) not null default 0,
  buscado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, chave)
);

-- Domínios que a busca na web recusou (erro 400): ficam fora das próximas buscas ---------------
create table if not exists public.ia_dominios_bloqueados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  dominio text not null,
  primeira_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  contagem int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dominio)
);

do $$
declare t text;
begin
  foreach t in array array['geracoes', 'fontes_tema', 'ia_dominios_bloqueados'] loop
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

create or replace function public.registrar_dominio_bloqueado(d text)
returns void language sql security invoker set search_path = public as $$
  insert into ia_dominios_bloqueados (dominio) values (lower(d))
  on conflict (user_id, dominio) do update
    set contagem = ia_dominios_bloqueados.contagem + 1, ultima_vez = now();
$$;
grant execute on function public.registrar_dominio_bloqueado(text) to authenticated;

-- Limite diário e gasto: linhas de reaproveitamento (sem chamada à API) não contam -------------
create or replace function public.resumo_ia(fuso text default 'America/Sao_Paulo')
returns table (chamadas_hoje bigint, custo_mes numeric, chamadas_mes bigint, custo_hoje numeric)
language sql stable security invoker set search_path = public as $$
  select
    count(*) filter (where not reaproveitado and (created_at at time zone fuso)::date = (now() at time zone fuso)::date),
    coalesce(sum(custo_usd) filter (where date_trunc('month', created_at at time zone fuso) = date_trunc('month', now() at time zone fuso)), 0),
    count(*) filter (where not reaproveitado and date_trunc('month', created_at at time zone fuso) = date_trunc('month', now() at time zone fuso)),
    coalesce(sum(custo_usd) filter (where (created_at at time zone fuso)::date = (now() at time zone fuso)::date), 0)
  from ia_chamadas where user_id = auth.uid();
$$;
grant execute on function public.resumo_ia(text) to authenticated;

-- Painel do mês (Você › Configurações) ---------------------------------------------------------
drop function if exists public.painel_ia(text);
create function public.painel_ia(fuso text default 'America/Sao_Paulo')
returns table (
  custo_mes numeric,
  aulas_mes bigint,
  custo_aulas_mes numeric,
  geracoes_mes bigint,
  geracoes_ok_mes bigint,
  cache_tokens_mes bigint,
  economia_cache_usd numeric,
  economia_reuso_usd numeric,
  reaproveitamentos_mes bigint
)
language sql stable security invoker set search_path = public as $$
  with mes as (
    select * from ia_chamadas
    where user_id = auth.uid()
      and date_trunc('month', created_at at time zone fuso) = date_trunc('month', now() at time zone fuso)
  ), ger as (
    select * from geracoes
    where user_id = auth.uid()
      and date_trunc('month', created_at at time zone fuso) = date_trunc('month', now() at time zone fuso)
  )
  select
    (select coalesce(sum(custo_usd), 0) from mes),
    (select count(*) from ger where status = 'concluida'),
    (select coalesce(sum(m.custo_usd), 0) from mes m join ger g on g.id = m.geracao_id and g.status = 'concluida'),
    (select count(*) from ger),
    (select count(*) from ger where status = 'concluida'),
    (select coalesce(sum(cache_leitura_tokens), 0) from mes where not reaproveitado),
    (select coalesce(sum(economia_usd), 0) from mes where not reaproveitado),
    (select coalesce(sum(economia_usd), 0) from mes where reaproveitado),
    (select count(*) from mes where reaproveitado);
$$;
grant execute on function public.painel_ia(text) to authenticated;
