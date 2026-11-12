-- PMRD: esquema base do banco (Supabase).
-- Pode ser rodado mais de uma vez (SQL Editor -> colar tudo -> Run).
--
-- Regras de acesso:
--   * anon (quem não entrou): nada. Não recebe privilégio em nenhuma tabela.
--   * Pessoa do PCM com perfil ATIVO (eh_do_pcm): lê tudo; insere e atualiza
--     projetos e defeitos; nunca apaga projeto (nada se apaga, só muda de etapa).
--   * Administrador ativo (eh_admin): também insere e muda equipes,
--     solicitantes_sgd e motivos (nunca apaga: desativa) e muda parametros.
--   * Ninguém escreve direto em perfis nem em historico (perfis só pelas
--     funções do próprio usuário; historico só pelo gatilho).
--   * service_role (importador e script de SGD, chave guardada no PC) pode tudo
--     e ignora as regras de linha.
-- O Supabase já nasce dando tudo para anon e authenticated em public; por isso
-- cada tabela leva "revoke all" e depois os privilégios um por um.

-- ---------------------------------------------------------------
-- 1. Regionais
-- ---------------------------------------------------------------
create table if not exists public.regionais (
  id          text primary key check (id in ('CS', 'SUL', 'LESTE')),
  nome_report text not null
);

insert into public.regionais (id, nome_report) values
  ('CS', 'PCM CENTRO-SUL'),
  ('SUL', 'PCM SUL'),
  ('LESTE', 'PCM LESTE')
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- 2. Perfis: uma linha por pessoa que entra no site
-- ---------------------------------------------------------------
create table if not exists public.perfis (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text,
  nome               text not null default '',
  papel              text not null default 'equipe' check (papel in ('admin', 'equipe')),
  ativo              boolean not null default true,
  senha_provisoria   boolean not null default true,
  regional_preferida text not null default 'TODAS' check (regional_preferida in ('CS', 'SUL', 'LESTE', 'TODAS')),
  tema               text not null default 'sistema' check (tema in ('sistema', 'claro', 'escuro'))
);

-- ---------------------------------------------------------------
-- 3. Quem é do PCM e quem é administrador
--    (security definer: lê perfis sem cair nas regras de linha de perfis).
--    eh_do_pcm exige papel admin ou equipe, igual ao 002: rodar este arquivo
--    de novo depois do 002 não devolve leitura ao robô importador.
-- ---------------------------------------------------------------
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

create or replace function public.eh_admin()
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
       and papel = 'admin'
  );
$$;

revoke all on function public.eh_do_pcm() from public, anon;
revoke all on function public.eh_admin() from public, anon;
grant execute on function public.eh_do_pcm() to authenticated, service_role;
grant execute on function public.eh_admin() to authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. Equipes, solicitantes de SGD, motivos e parâmetros (configuração)
-- ---------------------------------------------------------------
create table if not exists public.equipes (
  lid          text primary key,
  chefe        text not null default '',
  tipo         text not null check (tipo in ('ML', 'LVR', 'MP', 'LV')),
  regional     text not null references public.regionais (id),
  grupo_report text,
  base         text,
  ativa        boolean not null default true,
  foto_path    text
);

-- Sem nomes aqui: o administrador cadastra pelo site.
create table if not exists public.solicitantes_sgd (
  id    uuid primary key default gen_random_uuid(),
  nome  text not null,
  email text,
  ativo boolean not null default true
);

create table if not exists public.motivos (
  id    uuid primary key default gen_random_uuid(),
  nome  text not null unique,
  ativo boolean not null default true,
  ordem int not null default 0
);

-- Motivos iniciais (spec 6.7). O administrador pode acrescentar ou desativar.
insert into public.motivos (nome, ordem) values
  ('ABSENTEÍSMO', 1),
  ('CHAVE EMPERRADA', 2),
  ('EMERGENCIAL', 3),
  ('ESCAVAÇÃO', 4),
  ('MATERIAL', 5),
  ('PLANEJAMENTO', 6),
  ('SGD INVALIDADO', 7),
  ('SOLO ENCHARCADO', 8)
on conflict (nome) do nothing;

-- Uma linha só (id = 1). Prazos em dias, raio do mapa em km.
create table if not exists public.parametros (
  id                     int primary key check (id = 1),
  validade_vistoria      int not null default 45,
  prazo_reenvio_vistoria int not null default 15,
  alerta_vencimento      int not null default 7,
  alerta_prazo           int not null default 3,
  parado_amarelo         int not null default 7,
  parado_vermelho        int not null default 15,
  raio_mapa_km           int not null default 10
);

insert into public.parametros (id) values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- 5. Projetos (carteira) e defeitos (ID GOM)
-- ---------------------------------------------------------------
create table if not exists public.projetos (
  projeto               text primary key,
  regional              text not null references public.regionais (id),
  origem                text not null default 'manual' check (origem in ('enel', 'manual')),
  ot_correcao           text,
  municipio             text,
  endereco              text,
  prioridade            int check (prioridade between 1 and 11),
  pedido_gestor         boolean not null default false,
  pedido_gestor_em      date,
  pedido_gestor_por     text,
  alimentadores         text[] not null default '{}',
  elemento_corte        text,
  qtd_clientes          int,
  estruturas            text[] not null default '{}',
  intervencao_prevista  text,
  etapa                 text not null default 'EM ANÁLISE',
  etapa_desde           timestamptz not null default now(),
  proxima_acao          text,
  prazo_proxima_acao    date,
  vistoria_data         date,
  vistoria_situacao     text,
  vistoria_recurso      text,
  vistoria_intervencao  text,
  vistoria_observacao   text,
  vistoria_enviada_em   date,
  responsavel           uuid references public.perfis (id) on delete set null,
  saiu_da_demanda       boolean not null default false,
  qtd_defeitos_informada int,
  lat                   double precision,
  lng                   double precision,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- As 12 etapas, iguais às de src/dominio/etapas.ts (mesma grafia e acentos).
-- Recriada a cada execução para a lista daqui valer sempre.
alter table public.projetos drop constraint if exists projetos_etapa_check;
alter table public.projetos add constraint projetos_etapa_check check (etapa in (
  'EM ANÁLISE',
  'SOLICITAR VISTORIA',
  'AGUARDANDO VISTORIA',
  'ANÁLISE PÓS-VISTORIA',
  'PROGRAMAR EXECUÇÃO',
  'SOLICITAR SGD',
  'AGUARDANDO SGD',
  'PROGRAMADA',
  'PENDENTE DE RETORNO',
  'EXECUTADA',
  'TRANSFERIDA',
  'NÃO EXECUTÁVEL'
));

create index if not exists projetos_regional_etapa on public.projetos (regional, etapa);

create table if not exists public.defeitos (
  id_gom      text primary key,
  projeto     text not null references public.projetos (projeto),
  prioridade  int check (prioridade between 1 and 11),
  estrutura   text,
  alimentador text,
  estado_enel text,
  situacao    text not null default 'pendente'
              check (situacao in ('pendente', 'programado', 'executado', 'removido')),
  lat         double precision,
  lng         double precision
);

create index if not exists defeitos_projeto on public.defeitos (projeto);

-- ---------------------------------------------------------------
-- 6. Histórico: quem mudou o quê e quando
-- ---------------------------------------------------------------
create table if not exists public.historico (
  id        bigint generated always as identity primary key,
  tabela    text not null,
  chave     text not null,
  operacao  text not null,
  antes     jsonb,
  depois    jsonb,
  quem      uuid,
  quando    timestamptz not null default now()
);

create index if not exists historico_tabela_chave on public.historico (tabela, chave, quando);

-- ---------------------------------------------------------------
-- 7. Regras de linha (RLS) e privilégios
-- ---------------------------------------------------------------
alter table public.regionais        enable row level security;
alter table public.perfis           enable row level security;
alter table public.equipes          enable row level security;
alter table public.solicitantes_sgd enable row level security;
alter table public.motivos          enable row level security;
alter table public.parametros       enable row level security;
alter table public.projetos         enable row level security;
alter table public.defeitos         enable row level security;
alter table public.historico        enable row level security;

-- Regionais: o PCM lê; ninguém escreve pelo site.
drop policy if exists "regionais: ler pcm" on public.regionais;
create policy "regionais: ler pcm"
  on public.regionais for select
  to authenticated
  using ((select public.eh_do_pcm()));

-- Perfis: o PCM lê todos (nome do responsável); cada pessoa lê a própria
-- linha mesmo inativa (o site precisa saber que a conta foi desativada).
-- Não há regra de insert/update/delete.
drop policy if exists "perfis: ler pcm ou o proprio" on public.perfis;
create policy "perfis: ler pcm ou o proprio"
  on public.perfis for select
  to authenticated
  using ((select public.eh_do_pcm()) or id = (select auth.uid()));

-- Configuração: o PCM lê; só administrador insere e muda. Equipe, solicitante
-- e motivo nunca se apagam, só se desativam (o histórico e o Report usam o nome).
-- A regra antiga "admin escreve" (que deixava apagar) é removida se existir.
drop policy if exists "equipes: ler pcm" on public.equipes;
create policy "equipes: ler pcm"
  on public.equipes for select
  to authenticated
  using ((select public.eh_do_pcm()));

drop policy if exists "equipes: admin escreve" on public.equipes;
drop policy if exists "equipes: admin insere" on public.equipes;
create policy "equipes: admin insere"
  on public.equipes for insert
  to authenticated
  with check ((select public.eh_admin()));

drop policy if exists "equipes: admin muda" on public.equipes;
create policy "equipes: admin muda"
  on public.equipes for update
  to authenticated
  using ((select public.eh_admin()))
  with check ((select public.eh_admin()));

drop policy if exists "solicitantes_sgd: ler pcm" on public.solicitantes_sgd;
create policy "solicitantes_sgd: ler pcm"
  on public.solicitantes_sgd for select
  to authenticated
  using ((select public.eh_do_pcm()));

drop policy if exists "solicitantes_sgd: admin escreve" on public.solicitantes_sgd;
drop policy if exists "solicitantes_sgd: admin insere" on public.solicitantes_sgd;
create policy "solicitantes_sgd: admin insere"
  on public.solicitantes_sgd for insert
  to authenticated
  with check ((select public.eh_admin()));

drop policy if exists "solicitantes_sgd: admin muda" on public.solicitantes_sgd;
create policy "solicitantes_sgd: admin muda"
  on public.solicitantes_sgd for update
  to authenticated
  using ((select public.eh_admin()))
  with check ((select public.eh_admin()));

drop policy if exists "motivos: ler pcm" on public.motivos;
create policy "motivos: ler pcm"
  on public.motivos for select
  to authenticated
  using ((select public.eh_do_pcm()));

drop policy if exists "motivos: admin escreve" on public.motivos;
drop policy if exists "motivos: admin insere" on public.motivos;
create policy "motivos: admin insere"
  on public.motivos for insert
  to authenticated
  with check ((select public.eh_admin()));

drop policy if exists "motivos: admin muda" on public.motivos;
create policy "motivos: admin muda"
  on public.motivos for update
  to authenticated
  using ((select public.eh_admin()))
  with check ((select public.eh_admin()));

drop policy if exists "parametros: ler pcm" on public.parametros;
create policy "parametros: ler pcm"
  on public.parametros for select
  to authenticated
  using ((select public.eh_do_pcm()));

drop policy if exists "parametros: admin muda" on public.parametros;
create policy "parametros: admin muda"
  on public.parametros for update
  to authenticated
  using ((select public.eh_admin()))
  with check ((select public.eh_admin()));

-- Projetos e defeitos: o PCM lê, insere e atualiza. Não há regra de delete.
drop policy if exists "projetos: ler pcm" on public.projetos;
create policy "projetos: ler pcm"
  on public.projetos for select
  to authenticated
  using ((select public.eh_do_pcm()));

drop policy if exists "projetos: inserir pcm" on public.projetos;
create policy "projetos: inserir pcm"
  on public.projetos for insert
  to authenticated
  with check ((select public.eh_do_pcm()));

drop policy if exists "projetos: mudar pcm" on public.projetos;
create policy "projetos: mudar pcm"
  on public.projetos for update
  to authenticated
  using ((select public.eh_do_pcm()))
  with check ((select public.eh_do_pcm()));

drop policy if exists "defeitos: ler pcm" on public.defeitos;
create policy "defeitos: ler pcm"
  on public.defeitos for select
  to authenticated
  using ((select public.eh_do_pcm()));

drop policy if exists "defeitos: inserir pcm" on public.defeitos;
create policy "defeitos: inserir pcm"
  on public.defeitos for insert
  to authenticated
  with check ((select public.eh_do_pcm()));

drop policy if exists "defeitos: mudar pcm" on public.defeitos;
create policy "defeitos: mudar pcm"
  on public.defeitos for update
  to authenticated
  using ((select public.eh_do_pcm()))
  with check ((select public.eh_do_pcm()));

-- Histórico: o PCM lê; só o gatilho escreve.
drop policy if exists "historico: ler pcm" on public.historico;
create policy "historico: ler pcm"
  on public.historico for select
  to authenticated
  using ((select public.eh_do_pcm()));

-- Privilégios explícitos. anon não recebe nada.
revoke all on public.regionais, public.perfis, public.equipes, public.solicitantes_sgd,
              public.motivos, public.parametros, public.projetos, public.defeitos,
              public.historico
  from anon, authenticated;
revoke all on sequence public.historico_id_seq from anon, authenticated;

grant select on public.regionais to authenticated;
grant select on public.perfis to authenticated;
grant select, insert, update on public.equipes to authenticated;
grant select, insert, update on public.solicitantes_sgd to authenticated;
grant select, insert, update on public.motivos to authenticated;
grant select, update on public.parametros to authenticated;
grant select, insert, update on public.projetos to authenticated;
grant select, insert, update on public.defeitos to authenticated;
grant select on public.historico to authenticated;

grant all on public.regionais, public.perfis, public.equipes, public.solicitantes_sgd,
             public.motivos, public.parametros, public.projetos, public.defeitos,
             public.historico
  to service_role;
grant all on sequence public.historico_id_seq to service_role;

-- ---------------------------------------------------------------
-- 8. Gatilho: cria o perfil quando o Italo cria a conta
-- ---------------------------------------------------------------
create or replace function public.criar_perfil_do_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.criar_perfil_do_usuario() from public, anon, authenticated;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_do_usuario();

-- ---------------------------------------------------------------
-- 9. Funções do próprio usuário (mexem só na linha de quem chama)
-- ---------------------------------------------------------------
-- Valor nulo mantém o que já estava (o botão de tema só manda o tema).
create or replace function public.guardar_preferencias(p_regional text, p_tema text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.perfis
     set regional_preferida = coalesce(p_regional, regional_preferida),
         tema               = coalesce(p_tema, tema)
   where id = (select auth.uid())
     and ativo;
$$;

create or replace function public.marcar_senha_trocada()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.perfis
     set senha_provisoria = false
   where id = (select auth.uid())
     and ativo;
$$;

revoke all on function public.guardar_preferencias(text, text) from public, anon;
revoke all on function public.marcar_senha_trocada() from public, anon;
grant execute on function public.guardar_preferencias(text, text) to authenticated;
grant execute on function public.marcar_senha_trocada() to authenticated;

-- ---------------------------------------------------------------
-- 10. Gatilhos de projetos
-- ---------------------------------------------------------------
-- Em todo update: carimba atualizado_em; se a etapa mudou, carimba etapa_desde;
-- projeto e origem não mudam (só o service_role pode corrigir). Fora do
-- service_role, etapa_desde (sem mudar a etapa) e criado_em não se reescrevem.
create or replace function public.projetos_antes_de_mudar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_servico boolean := current_user = 'service_role'
                       or coalesce((select auth.role()), '') = 'service_role';
begin
  if (new.projeto is distinct from old.projeto or new.origem is distinct from old.origem)
     and not v_servico then
    raise exception 'Projeto e origem não mudam depois de criados.';
  end if;

  new.atualizado_em := now();
  if new.etapa is distinct from old.etapa then
    new.etapa_desde := now();
  elsif not v_servico then
    new.etapa_desde := old.etapa_desde;
  end if;
  if not v_servico then
    new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;

revoke all on function public.projetos_antes_de_mudar() from public, anon, authenticated;

drop trigger if exists antes_de_mudar on public.projetos;
create trigger antes_de_mudar
  before update on public.projetos
  for each row execute function public.projetos_antes_de_mudar();

-- ---------------------------------------------------------------
-- 11. Gatilho de histórico (projetos e defeitos)
-- ---------------------------------------------------------------
-- O argumento do gatilho é o nome da coluna-chave. No update guarda só os
-- campos que mudaram, sem atualizado_em e etapa_desde (mudam sempre, seriam
-- ruído); se nada mudou, não grava. Na inclusão guarda a linha nova inteira;
-- na exclusão (só service_role), a linha antiga inteira.
-- security definer: grava em historico, onde ninguém escreve direto.
create or replace function public.registrar_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coluna text := tg_argv[0];
  v_antes  jsonb;
  v_depois jsonb;
  v_chave  text;
begin
  if tg_op = 'INSERT' then
    v_depois := to_jsonb(new);
    v_chave  := v_depois ->> v_coluna;
  elsif tg_op = 'DELETE' then
    v_antes := to_jsonb(old);
    v_chave := v_antes ->> v_coluna;
  else
    select jsonb_object_agg(a.key, a.value), jsonb_object_agg(a.key, d.value)
      into v_antes, v_depois
      from jsonb_each(to_jsonb(old)) a
      join jsonb_each(to_jsonb(new)) d using (key)
     where a.value is distinct from d.value
       and a.key not in ('atualizado_em', 'etapa_desde');
    if v_antes is null then
      return null;
    end if;
    v_chave := to_jsonb(new) ->> v_coluna;
  end if;

  insert into public.historico (tabela, chave, operacao, antes, depois, quem)
  values (tg_table_name, v_chave, tg_op, v_antes, v_depois, (select auth.uid()));
  return null;
end;
$$;

revoke all on function public.registrar_historico() from public, anon, authenticated;

drop trigger if exists historico_projetos on public.projetos;
create trigger historico_projetos
  after insert or update or delete on public.projetos
  for each row execute function public.registrar_historico('projeto');

drop trigger if exists historico_defeitos on public.defeitos;
create trigger historico_defeitos
  after insert or update or delete on public.defeitos
  for each row execute function public.registrar_historico('id_gom');
