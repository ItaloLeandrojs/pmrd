-- PMRD: papel importador, importações e fila de novidades (plano 2).
-- Roda depois do 001. Pode ser rodado mais de uma vez (SQL Editor -> colar tudo -> Run).
--
-- Quem pode o quê:
--   * anon (quem não entrou): nada.
--   * admin e equipe ativos (eh_do_pcm): leem importacoes e novidades.
--     Não escrevem direto; só as funções security definer das próximas
--     tarefas mudam essas tabelas.
--   * importador ativo (a conta do robô): não é do PCM, não lê nada das
--     tabelas (só o próprio perfil) e só executará as funções de envio da
--     demanda e de registro de erro.
--   * service_role pode tudo e ignora as regras de linha.

-- ---------------------------------------------------------------
-- 1. Papel importador
-- ---------------------------------------------------------------
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('admin', 'equipe', 'importador'));

-- eh_do_pcm passa a exigir papel admin ou equipe: o robô fica sem leitura e
-- sem escrita em todas as regras do plano 1. A regra "perfis: ler pcm ou o
-- proprio" continua deixando o robô ler a própria linha.
create or replace function public.eh_do_pcm()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis
     where id = (select auth.uid())
       and ativo
       and papel in ('admin', 'equipe')
  );
$$;

create or replace function public.eh_importador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis
     where id = (select auth.uid())
       and ativo
       and papel = 'importador'
  );
$$;

revoke all on function public.eh_do_pcm() from public, anon;
revoke all on function public.eh_importador() from public, anon;
grant execute on function public.eh_do_pcm() to authenticated, service_role;
grant execute on function public.eh_importador() to authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. Importações: um registro por envio (ou erro) do robô e por carga
-- ---------------------------------------------------------------
create table if not exists public.importacoes (
  id       bigint generated always as identity primary key,
  tipo     text not null check (tipo in ('demanda', 'erro', 'carga')),
  regional text references public.regionais (id),   -- vazio na carga
  arquivo  text not null default '',
  quando   timestamptz not null default now(),
  -- {novo, mudou, saiu, corrigido, sem_mudanca, avisos: text[]}
  resumo   jsonb not null default '{}',
  erro     text
);

create index if not exists importacoes_quando on public.importacoes (quando desc);

-- ---------------------------------------------------------------
-- 3. Novidades: fila do que a Enel mudou, para o PCM aceitar ou recusar
-- ---------------------------------------------------------------
create table if not exists public.novidades (
  id             bigint generated always as identity primary key,
  importacao_id  bigint not null references public.importacoes (id),
  regional       text not null references public.regionais (id),
  projeto        text not null,
  tipo           text not null check (tipo in ('novo', 'mudou', 'saiu', 'corrigido')),
  dados          jsonb not null,
  assinatura     text not null,                      -- md5(tipo || projeto || dados::text)
  situacao       text not null default 'aberta'
                 check (situacao in ('aberta', 'aceita', 'recusada', 'substituida')),
  escolha        text,
  criada_em      timestamptz not null default now(),
  decidida_em    timestamptz,
  decidida_por   uuid references public.perfis (id) on delete set null
);

-- Uma novidade aberta por regional, projeto e tipo.
create unique index if not exists novidades_uma_aberta
  on public.novidades (regional, projeto, tipo)
  where situacao = 'aberta';

create index if not exists novidades_importacao on public.novidades (importacao_id);

-- ---------------------------------------------------------------
-- 4. Regras de linha (RLS) e privilégios
-- ---------------------------------------------------------------
alter table public.importacoes enable row level security;
alter table public.novidades   enable row level security;

drop policy if exists "importacoes: ler pcm" on public.importacoes;
create policy "importacoes: ler pcm"
  on public.importacoes for select
  to authenticated
  using ((select public.eh_do_pcm()));

drop policy if exists "novidades: ler pcm" on public.novidades;
create policy "novidades: ler pcm"
  on public.novidades for select
  to authenticated
  using ((select public.eh_do_pcm()));

-- anon não recebe nada; authenticated só lê (e as regras acima filtram).
revoke all on public.importacoes, public.novidades from anon, authenticated;
revoke all on sequence public.importacoes_id_seq, public.novidades_id_seq from anon, authenticated;

grant select on public.importacoes to authenticated;
grant select on public.novidades to authenticated;

grant all on public.importacoes, public.novidades to service_role;
grant all on sequence public.importacoes_id_seq, public.novidades_id_seq to service_role;
