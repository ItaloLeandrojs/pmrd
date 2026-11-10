-- Imitação do que o Supabase já traz pronto, SÓ para os testes locais (PGlite).
-- Nunca rodar no Supabase de verdade: lá o schema auth, as funções
-- auth.uid() e auth.role() e os papéis anon, authenticated e service_role já existem.

-- ---------------------------------------------------------------
-- 1. Schema auth e a tabela de contas (só as colunas que usamos)
-- ---------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key,
  email text
);

-- ---------------------------------------------------------------
-- 2. auth.uid() e auth.role(): iguais às do Supabase
--    (leem o JWT que o PostgREST coloca na transação)
-- ---------------------------------------------------------------
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

-- ---------------------------------------------------------------
-- 3. Papéis do Supabase (service_role ignora as regras de linha)
-- ---------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. Privilégios padrão do Supabase: tudo que se cria em public já nasce
--    liberado para os três papéis. É por isso que o 001_base.sql faz
--    "revoke all" antes de dar os privilégios um por um; aqui imitamos
--    isso para o teste provar que o revoke funciona.
-- ---------------------------------------------------------------
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
