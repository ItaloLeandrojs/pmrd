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
  assinatura     text not null,                      -- md5(tipo || projeto || fatos que pedem decisão)
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

-- ---------------------------------------------------------------
-- 5. enviar_demanda: compara a foto da demanda da Enel com a carteira
-- ---------------------------------------------------------------
-- O robô importador manda a foto inteira de uma regional:
--   projetos:  só os projetos ativos, cada um com municipio, alimentadores e
--              defeitos [{id_gom, prioridade, estrutura, alimentador,
--              estado_enel, lat, lng}];
--   presentes: todo projeto que aparece na aba (ativo ou não);
--   fechados:  defeitos não ativos [{id_gom, estado_enel}];
--   avisos:    textos que o importador quer mostrar no resumo.
--
-- Calcula, só dentro de p_regional e nesta ordem:
--   novo      projeto ativo que não existe na carteira (dados = o projeto do
--             envio, com os defeitos em ordem de ID);
--   mudou     projeto da carteira com defeitos que entram (inclusive um
--             removido que voltou; executado não volta), defeitos que saem
--             (pendente ou programado que não está ativo nem fechado) ou
--             prioridade nova (a menor dos ativos). Só alimentadores
--             diferentes não é mudança;
--   corrigido defeitos fechados que na carteira estão pendente ou
--             programado, por projeto;
--   saiu      projeto da Enel, não marcado como fora da demanda, fora das
--             etapas finais, que não aparece na aba.
-- Defeito do grupo SEM-PROJETO-<regional> que já está em outro projeto (não
-- removido) fica onde o PCM o pôs: sai do grupo e não conta como "saem"
-- (decisão de 11/11).
--
-- Repetição: a assinatura cobre só os fatos da demanda que pedem decisão,
-- com as listas sempre na mesma ordem:
--   novo      IDs ativos + prioridade do projeto (a menor dos ativos);
--   mudou     IDs que entram + IDs que saem + prioridade nova;
--   corrigido pares (id_gom, estado_enel);
--   saiu      só tipo e projeto.
-- assinatura = md5(tipo || projeto || esses fatos). dados guarda tudo.
-- Já existe aberta com a mesma assinatura: só atualiza o dados dela (sem
-- linha nova). Recusada com a mesma assinatura: não volta. Aberta do mesmo
-- projeto e tipo com outra assinatura: vira substituida. No fim, toda aberta
-- da regional cujo (projeto, tipo) não foi calculado nesta rodada também vira
-- substituida (resolveu sozinha).
--
-- Tudo numa só transação: erro no meio não grava nada.
create or replace function public.enviar_demanda(p_regional text, p_arquivo text, p_envio jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_projetos     jsonb;
  v_presentes    text[];
  v_fechados     jsonb;
  v_ids_fechados text[];
  v_avisos       jsonb;
  v_outras       jsonb;
  v_importacao   bigint;
  v_item         record;
  v_assinatura   text;
  v_calculadas   text[] := '{}';
  v_mudou_calc   int;
  v_na_carteira  int;
  v_contagem     jsonb := '{"novo": 0, "mudou": 0, "saiu": 0, "corrigido": 0}';
  v_resumo       jsonb;
  v_texto        text;
  v_sem_projeto  text := 'SEM-PROJETO-' || p_regional;
  v_ids_sem_proj text[];
begin
  if not public.eh_importador() then
    raise exception 'Só o importador envia a demanda.';
  end if;

  if p_regional is null or not exists (select 1 from public.regionais where id = p_regional) then
    raise exception 'Regional desconhecida: %.', coalesce(p_regional, '(vazia)');
  end if;

  -- ---- Conferência do envio (nada é gravado se algo estiver fora) ----
  if p_envio is null
     or jsonb_typeof(p_envio -> 'projetos') is distinct from 'array'
     or jsonb_typeof(p_envio -> 'presentes') is distinct from 'array' then
    raise exception 'Envio sem a lista de projetos ou de presentes.';
  end if;
  if coalesce(jsonb_typeof(p_envio -> 'fechados'), 'array') <> 'array'
     or coalesce(jsonb_typeof(p_envio -> 'avisos'), 'array') <> 'array' then
    raise exception 'Envio com fechados ou avisos fora do formato de lista.';
  end if;

  v_projetos := p_envio -> 'projetos';
  v_fechados := coalesce(p_envio -> 'fechados', '[]'::jsonb);
  v_avisos   := coalesce(p_envio -> 'avisos', '[]'::jsonb);

  if exists (select 1 from jsonb_array_elements(v_projetos) e
              where jsonb_typeof(e.value) <> 'object'
                 or coalesce(btrim(e.value ->> 'projeto'), '') = ''
                 or coalesce(jsonb_typeof(e.value -> 'defeitos'), 'array') <> 'array') then
    raise exception 'Projeto sem nome ou sem lista de defeitos no envio.';
  end if;

  select e.value ->> 'projeto' into v_texto
    from jsonb_array_elements(v_projetos) e
   group by e.value ->> 'projeto'
  having count(*) > 1
   limit 1;
  if found then
    raise exception 'Projeto repetido no envio: %.', v_texto;
  end if;

  select e.value ->> 'projeto' into v_texto
    from jsonb_array_elements(v_projetos) e,
         jsonb_array_elements(coalesce(e.value -> 'defeitos', '[]'::jsonb)) d
   where jsonb_typeof(d.value) <> 'object'
      or coalesce(btrim(d.value ->> 'id_gom'), '') = ''
   limit 1;
  if found then
    raise exception 'Defeito sem ID no projeto %.', v_texto;
  end if;

  select d.value ->> 'id_gom' into v_texto
    from jsonb_array_elements(v_projetos) e,
         jsonb_array_elements(coalesce(e.value -> 'defeitos', '[]'::jsonb)) d
   group by d.value ->> 'id_gom'
  having count(*) > 1
   limit 1;
  if found then
    raise exception 'Defeito repetido no envio: %.', v_texto;
  end if;

  -- Prioridade: vazia (null) ou um número inteiro de 1 a 11.
  select format('Prioridade inválida no defeito %s: %s.', d.value ->> 'id_gom', d.value ->> 'prioridade')
    into v_texto
    from jsonb_array_elements(v_projetos) e,
         jsonb_array_elements(coalesce(e.value -> 'defeitos', '[]'::jsonb)) d
   where coalesce(jsonb_typeof(d.value -> 'prioridade'), 'null') <> 'null'
     and (jsonb_typeof(d.value -> 'prioridade') <> 'number'
          or (d.value ->> 'prioridade')::numeric not in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11))
   limit 1;
  if found then
    raise exception '%', v_texto;
  end if;

  if exists (select 1 from jsonb_array_elements(v_fechados) f
              where jsonb_typeof(f.value) <> 'object'
                 or coalesce(btrim(f.value ->> 'id_gom'), '') = '') then
    raise exception 'Defeito fechado sem ID no envio.';
  end if;

  -- Um item vazio (null) em presentes faria todo projeto fora da lista
  -- escapar do "saiu" em silêncio.
  if exists (select 1 from jsonb_array_elements(p_envio -> 'presentes') x
              where jsonb_typeof(x.value) <> 'string'
                 or btrim(x.value #>> '{}') = '') then
    raise exception 'Projeto vazio ou fora do formato na lista de presentes.';
  end if;

  -- Presentes: a lista da aba mais os ativos (por garantia).
  select coalesce(array_agg(distinct t.x), '{}') into v_presentes
    from (
      select jsonb_array_elements_text(p_envio -> 'presentes') as x
      union all
      select e.value ->> 'projeto' from jsonb_array_elements(v_projetos) e
    ) t;

  select coalesce(array_agg(distinct f.value ->> 'id_gom'), '{}') into v_ids_fechados
    from jsonb_array_elements(v_fechados) f;

  -- Um envio por regional de cada vez.
  perform pg_advisory_xact_lock(hashtext('pmrd.enviar_demanda.' || p_regional));

  -- Sem projeto na Enel (decisão de 11/11): defeito do grupo SEM-PROJETO-<regional>
  -- que o PCM já pôs em OUTRO projeto (e não removeu) fica no projeto do PCM. Sai
  -- do grupo antes de tudo (não entra em novo, entram nem na assinatura) e não
  -- conta como "saem" do projeto onde está só por ter vindo sem projeto.
  select coalesce(array_agg(d.value ->> 'id_gom'), '{}') into v_ids_sem_proj
    from jsonb_array_elements(v_projetos) e,
         jsonb_array_elements(coalesce(e.value -> 'defeitos', '[]'::jsonb)) d
   where e.value ->> 'projeto' = v_sem_projeto;

  select coalesce(jsonb_agg(
           case when e.value ->> 'projeto' = v_sem_projeto
                then jsonb_set(e.value, '{defeitos}', (
                       select coalesce(jsonb_agg(d.value order by d.n), '[]'::jsonb)
                         from jsonb_array_elements(coalesce(e.value -> 'defeitos', '[]'::jsonb))
                              with ordinality as d (value, n)
                        where not exists (select 1 from public.defeitos x
                                           where x.id_gom = d.value ->> 'id_gom'
                                             and x.projeto <> v_sem_projeto
                                             and x.situacao <> 'removido')))
                else e.value end
           order by e.n), '[]'::jsonb)
    into v_projetos
    from jsonb_array_elements(v_projetos) with ordinality as e (value, n);

  -- Projeto ativo que está na carteira de outra regional: fica de fora, com aviso.
  select coalesce(jsonb_agg(to_jsonb(format(
           'O projeto %s está na carteira do %s e ficou de fora deste envio.', p.projeto, p.regional))
           order by p.projeto collate "C"), '[]'::jsonb)
    into v_outras
    from jsonb_array_elements(v_projetos) e
    join public.projetos p on p.projeto = e.value ->> 'projeto'
   where p.regional <> p_regional;
  v_avisos := v_avisos || v_outras;

  select count(*) into v_na_carteira
    from jsonb_array_elements(v_projetos) e
    join public.projetos p on p.projeto = e.value ->> 'projeto' and p.regional = p_regional;

  insert into public.importacoes (tipo, regional, arquivo)
  values ('demanda', p_regional, coalesce(p_arquivo, ''))
  returning id into v_importacao;

  -- ---- Cálculo das novidades desta rodada ----
  for v_item in
    with envio as (
      select e.value as projeto_json,
             e.value ->> 'projeto' as projeto,
             coalesce(e.value -> 'defeitos', '[]'::jsonb) as defeitos
        from jsonb_array_elements(v_projetos) e
    ),
    novos as (
      select 1 as ordem, en.projeto, 'novo'::text as tipo,
             en.projeto_json || jsonb_build_object('defeitos', (
               select coalesce(jsonb_agg(d.value order by d.value ->> 'id_gom' collate "C"), '[]'::jsonb)
                 from jsonb_array_elements(en.defeitos) d)) as dados,
             jsonb_build_object(
               'ids', (select coalesce(jsonb_agg(d.value ->> 'id_gom' order by d.value ->> 'id_gom' collate "C"),
                                       '[]'::jsonb)
                         from jsonb_array_elements(en.defeitos) d),
               'prioridade', (select min((d.value ->> 'prioridade')::int)
                                from jsonb_array_elements(en.defeitos) d
                               where jsonb_typeof(d.value -> 'prioridade') = 'number')) as chave
        from envio en
       where not exists (select 1 from public.projetos p where p.projeto = en.projeto)
         -- SEM-PROJETO que ficou vazio (todos já estão em projetos do PCM): nada novo.
         and not (en.projeto = v_sem_projeto and jsonb_array_length(en.defeitos) = 0)
    ),
    mudancas as (
      select en.projeto, p.prioridade as prioridade_antes,
             ent.lista as entram, ent.ids as ids_entram, ent.n as n_entram,
             sa.lista as saem, sa.n as n_saem,
             case when pr.menor is not null and pr.menor is distinct from p.prioridade
                  then pr.menor end as prioridade_nova,
             coalesce(en.projeto_json -> 'alimentadores', '[]'::jsonb) as alimentadores
        from envio en
        join public.projetos p on p.projeto = en.projeto and p.regional = p_regional
        cross join lateral (
          select coalesce(jsonb_agg(d.value order by d.value ->> 'id_gom' collate "C"), '[]'::jsonb) as lista,
                 coalesce(jsonb_agg(d.value ->> 'id_gom' order by d.value ->> 'id_gom' collate "C"),
                          '[]'::jsonb) as ids,
                 count(*) as n
            from jsonb_array_elements(en.defeitos) d
           where not exists (
                   select 1 from public.defeitos x
                    where x.id_gom = d.value ->> 'id_gom'
                      and x.projeto = en.projeto
                      and x.situacao <> 'removido')
        ) ent
        cross join lateral (
          select coalesce(jsonb_agg(to_jsonb(x.id_gom) order by x.id_gom collate "C"), '[]'::jsonb) as lista,
                 count(*) as n
            from public.defeitos x
           where x.projeto = en.projeto
             and x.situacao in ('pendente', 'programado')
             and not (x.id_gom = any (v_ids_fechados))
             and not (x.id_gom = any (v_ids_sem_proj))
             and not exists (select 1 from jsonb_array_elements(en.defeitos) d
                              where d.value ->> 'id_gom' = x.id_gom)
        ) sa
        cross join lateral (
          select min((d.value ->> 'prioridade')::int) as menor
            from jsonb_array_elements(en.defeitos) d
           where jsonb_typeof(d.value -> 'prioridade') = 'number'
        ) pr
    ),
    mudou as (
      select 2 as ordem, m.projeto, 'mudou'::text as tipo,
             jsonb_build_object(
               'entram', m.entram,
               'saem', m.saem,
               'prioridade_antes', m.prioridade_antes,
               'prioridade_nova', m.prioridade_nova,
               'alimentadores', m.alimentadores) as dados,
             jsonb_build_object(
               'entram', m.ids_entram,
               'saem', m.saem,
               'prioridade_nova', m.prioridade_nova) as chave
        from mudancas m
       where m.n_entram > 0 or m.n_saem > 0 or m.prioridade_nova is not null
    ),
    fechados as (
      select distinct on (f.value ->> 'id_gom')
             f.value ->> 'id_gom' as id_gom, f.value -> 'estado_enel' as estado_enel
        from jsonb_array_elements(v_fechados) f
       order by f.value ->> 'id_gom'
    ),
    corrigidos as (
      select 3 as ordem, x.projeto, 'corrigido'::text as tipo,
             jsonb_build_object('defeitos', jsonb_agg(
               jsonb_build_object('id_gom', x.id_gom, 'estado_enel', f.estado_enel)
               order by x.id_gom collate "C")) as dados,
             jsonb_agg(jsonb_build_array(x.id_gom, f.estado_enel) order by x.id_gom collate "C") as chave
        from fechados f
        join public.defeitos x on x.id_gom = f.id_gom and x.situacao in ('pendente', 'programado')
        join public.projetos p on p.projeto = x.projeto and p.regional = p_regional
       group by x.projeto
    ),
    sairam as (
      select 4 as ordem, p.projeto, 'saiu'::text as tipo, jsonb_build_object('etapa', p.etapa) as dados,
             null::jsonb as chave
        from public.projetos p
       where p.origem = 'enel'
         and p.regional = p_regional
         and not p.saiu_da_demanda
         and p.etapa not in ('EXECUTADA', 'TRANSFERIDA', 'NÃO EXECUTÁVEL')
         and not (p.projeto = any (v_presentes))
    )
    select c.projeto, c.tipo, c.dados, c.chave
      from (select * from novos
            union all select * from mudou
            union all select * from corrigidos
            union all select * from sairam) c
     order by c.ordem, c.projeto collate "C"
  loop
    v_calculadas := v_calculadas || (v_item.tipo || '|' || v_item.projeto);
    v_assinatura := md5(v_item.tipo || v_item.projeto || coalesce(v_item.chave::text, ''));

    -- A aberta que pede outra decisão ficou velha.
    update public.novidades n
       set situacao = 'substituida', decidida_em = now()
     where n.regional = p_regional
       and n.projeto = v_item.projeto
       and n.tipo = v_item.tipo
       and n.situacao = 'aberta'
       and n.assinatura <> v_assinatura;

    -- A mesma decisão já está na fila: só atualiza o dados, sem linha nova.
    update public.novidades n
       set dados = v_item.dados
     where n.regional = p_regional
       and n.projeto = v_item.projeto
       and n.tipo = v_item.tipo
       and n.situacao = 'aberta'
       and n.assinatura = v_assinatura;
    continue when found;

    -- A mesma decisão já foi recusada: não volta.
    continue when exists (
      select 1 from public.novidades n
       where n.regional = p_regional
         and n.projeto = v_item.projeto
         and n.tipo = v_item.tipo
         and n.assinatura = v_assinatura
         and n.situacao = 'recusada');

    insert into public.novidades (importacao_id, regional, projeto, tipo, dados, assinatura)
    values (v_importacao, p_regional, v_item.projeto, v_item.tipo, v_item.dados, v_assinatura);

    v_contagem := jsonb_set(v_contagem, array[v_item.tipo],
                            to_jsonb((v_contagem ->> v_item.tipo)::int + 1));
  end loop;

  -- Resolvidas sozinhas: abertas da regional que esta rodada não calculou.
  update public.novidades n
     set situacao = 'substituida', decidida_em = now()
   where n.regional = p_regional
     and n.situacao = 'aberta'
     and not ((n.tipo || '|' || n.projeto) = any (v_calculadas));

  -- sem_mudanca: projetos ativos do envio que já estão na carteira da
  -- regional e não tiveram mudança calculada.
  select count(*) into v_mudou_calc from unnest(v_calculadas) k where k like 'mudou|%';

  v_resumo := v_contagem || jsonb_build_object(
    'sem_mudanca', v_na_carteira - v_mudou_calc,
    'avisos', v_avisos);

  update public.importacoes set resumo = v_resumo where id = v_importacao;
  return v_resumo;
end;
$$;

-- ---------------------------------------------------------------
-- 6. registrar_erro_importacao: planilha fora do padrão, nada enviado
-- ---------------------------------------------------------------
create or replace function public.registrar_erro_importacao(p_regional text, p_arquivo text, p_erro text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_importador() then
    raise exception 'Só o importador envia a demanda.';
  end if;
  if p_regional is not null and not exists (select 1 from public.regionais where id = p_regional) then
    raise exception 'Regional desconhecida: %.', p_regional;
  end if;

  insert into public.importacoes (tipo, regional, arquivo, erro)
  values ('erro', p_regional, coalesce(p_arquivo, ''),
          coalesce(nullif(btrim(p_erro), ''), 'Erro sem mensagem.'));
end;
$$;

-- A checagem de quem chama fica dentro das funções (eh_importador).
revoke all on function public.enviar_demanda(text, text, jsonb) from public, anon;
revoke all on function public.registrar_erro_importacao(text, text, text) from public, anon;
grant execute on function public.enviar_demanda(text, text, jsonb) to authenticated;
grant execute on function public.registrar_erro_importacao(text, text, text) to authenticated;

-- ---------------------------------------------------------------
-- 7. criar_projeto_da_demanda: projeto novo da Enel (interna)
-- ---------------------------------------------------------------
-- Recebe o projeto como o enviar_demanda guarda no dados do "novo":
--   {projeto, municipio, alimentadores, defeitos [{id_gom, prioridade,
--    estrutura, alimentador, estado_enel, lat, lng}]}.
-- Cria o projeto (origem enel, EM ANÁLISE, prioridade = a menor dos
-- defeitos, lat/lng = média dos defeitos com coordenada) e os defeitos
-- pendentes. Usada pelo aceitar_novidade e pela carga inicial; não tem
-- grant para authenticated (quem chama confere quem pode).
create or replace function public.criar_projeto_da_demanda(p_regional text, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_projeto  text := btrim(p_dados ->> 'projeto');
  v_defeitos jsonb := coalesce(p_dados -> 'defeitos', '[]'::jsonb);
  v_id       text;
  v_outro    text;
begin
  if coalesce(v_projeto, '') = '' or jsonb_typeof(v_defeitos) <> 'array' then
    raise exception 'Projeto sem nome ou sem lista de defeitos.';
  end if;

  if exists (select 1 from public.projetos where projeto = v_projeto) then
    raise exception 'Este projeto já está na carteira. Recuse esta novidade: a próxima importação mostra o que mudou.';
  end if;

  select d.value ->> 'id_gom', x.projeto into v_id, v_outro
    from jsonb_array_elements(v_defeitos) d
    join public.defeitos x on x.id_gom = d.value ->> 'id_gom'
   order by d.value ->> 'id_gom' collate "C"
   limit 1;
  if found then
    raise exception 'O defeito % já está no projeto %.', v_id, v_outro;
  end if;

  insert into public.projetos (projeto, regional, origem, etapa, municipio, alimentadores, prioridade, lat, lng)
  select v_projeto, p_regional, 'enel', 'EM ANÁLISE',
         nullif(btrim(p_dados ->> 'municipio'), ''),
         array(select jsonb_array_elements_text(coalesce(p_dados -> 'alimentadores', '[]'::jsonb))),
         (select min((d.value ->> 'prioridade')::int)
            from jsonb_array_elements(v_defeitos) d
           where jsonb_typeof(d.value -> 'prioridade') = 'number'),
         c.lat, c.lng
    from (select avg((d.value ->> 'lat')::double precision) as lat,
                 avg((d.value ->> 'lng')::double precision) as lng
            from jsonb_array_elements(v_defeitos) d
           where jsonb_typeof(d.value -> 'lat') = 'number'
             and jsonb_typeof(d.value -> 'lng') = 'number') c;

  insert into public.defeitos (id_gom, projeto, prioridade, estrutura, alimentador, estado_enel, situacao, lat, lng)
  select d.value ->> 'id_gom', v_projeto,
         case when jsonb_typeof(d.value -> 'prioridade') = 'number' then (d.value ->> 'prioridade')::int end,
         d.value ->> 'estrutura', d.value ->> 'alimentador', d.value ->> 'estado_enel', 'pendente',
         case when jsonb_typeof(d.value -> 'lat') = 'number' then (d.value ->> 'lat')::double precision end,
         case when jsonb_typeof(d.value -> 'lng') = 'number' then (d.value ->> 'lng')::double precision end
    from jsonb_array_elements(v_defeitos) d
   order by d.value ->> 'id_gom' collate "C";
end;
$$;

-- ---------------------------------------------------------------
-- 8. aceitar_novidade, aceitar_novidades e recusar_novidade
-- ---------------------------------------------------------------
-- Só administrador ativo (eh_admin). Tudo numa transação: um erro desfaz o
-- que já tinha sido gravado. O histórico do plano 1 registra o admin como
-- quem, porque o gatilho lê o auth.uid() de quem chamou.
--   novo      cria o projeto (criar_projeto_da_demanda).
--   mudou     entram viram pendente (um removido do mesmo projeto volta com
--             os campos novos); saem pendente ou programado viram removido;
--             prioridade_nova (se não for nula) e alimentadores vão para o
--             projeto. Etapa, próxima ação, responsável e município ficam.
--   saiu      p_escolha MANTER, TRANSFERIDA ou NÃO EXECUTÁVEL; sempre marca
--             saiu_da_demanda; nas duas últimas a etapa vira a escolha.
--   corrigido p_escolha EXECUTADO (viram executado) ou TIRAR (viram removido),
--             com o estado_enel novo.
-- mudou, saiu e corrigido de um projeto que não está mais na carteira da
-- regional: erro, para o admin recusar.
create or replace function public.aceitar_novidade(p_id bigint, p_escolha text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nov      public.novidades%rowtype;
  v_regional text;
  v_d        jsonb;
  v_id       text;
  v_atual    record;
  v_saem     text[];
  v_escolha  text;
begin
  if not public.eh_admin() then
    raise exception 'Só administrador decide as novidades.';
  end if;

  select * into v_nov from public.novidades where id = p_id for update;
  if not found then
    raise exception 'Novidade não encontrada.';
  end if;
  if v_nov.situacao <> 'aberta' then
    raise exception 'Esta novidade já foi decidida.';
  end if;

  if v_nov.tipo = 'novo' then
    perform public.criar_projeto_da_demanda(v_nov.regional, v_nov.dados);
  else
    select regional into v_regional from public.projetos where projeto = v_nov.projeto for update;
    if not found or v_regional <> v_nov.regional then
      raise exception 'O projeto % não está mais na carteira. Recuse esta novidade.', v_nov.projeto;
    end if;
  end if;

  if v_nov.tipo = 'mudou' then
    for v_d in select e.value from jsonb_array_elements(coalesce(v_nov.dados -> 'entram', '[]'::jsonb)) e
                order by e.value ->> 'id_gom' collate "C"
    loop
      v_id := v_d ->> 'id_gom';
      select projeto, situacao into v_atual from public.defeitos where id_gom = v_id for update;
      if not found then
        insert into public.defeitos (id_gom, projeto, prioridade, estrutura, alimentador, estado_enel, situacao, lat, lng)
        values (v_id, v_nov.projeto,
                case when jsonb_typeof(v_d -> 'prioridade') = 'number' then (v_d ->> 'prioridade')::int end,
                v_d ->> 'estrutura', v_d ->> 'alimentador', v_d ->> 'estado_enel', 'pendente',
                case when jsonb_typeof(v_d -> 'lat') = 'number' then (v_d ->> 'lat')::double precision end,
                case when jsonb_typeof(v_d -> 'lng') = 'number' then (v_d ->> 'lng')::double precision end);
      elsif v_atual.projeto <> v_nov.projeto then
        raise exception 'O defeito % já está no projeto %.', v_id, v_atual.projeto;
      elsif v_atual.situacao = 'removido' then
        -- Reaberto: volta com o que a Enel mostra agora.
        update public.defeitos
           set situacao    = 'pendente',
               prioridade  = case when jsonb_typeof(v_d -> 'prioridade') = 'number'
                                  then (v_d ->> 'prioridade')::int end,
               estrutura   = v_d ->> 'estrutura',
               alimentador = v_d ->> 'alimentador',
               estado_enel = v_d ->> 'estado_enel',
               lat = case when jsonb_typeof(v_d -> 'lat') = 'number' then (v_d ->> 'lat')::double precision end,
               lng = case when jsonb_typeof(v_d -> 'lng') = 'number' then (v_d ->> 'lng')::double precision end
         where id_gom = v_id;
      end if;
      -- Já está no projeto e não foi removido (alguém pôs à mão depois da
      -- foto): fica como está.
    end loop;

    select coalesce(array_agg(s), '{}') into v_saem
      from jsonb_array_elements_text(coalesce(v_nov.dados -> 'saem', '[]'::jsonb)) s;
    update public.defeitos
       set situacao = 'removido'
     where projeto = v_nov.projeto
       and id_gom = any (v_saem)
       and situacao in ('pendente', 'programado');

    -- prioridade_nova nula: a prioridade não mudou.
    update public.projetos
       set prioridade = case when jsonb_typeof(v_nov.dados -> 'prioridade_nova') = 'number'
                             then (v_nov.dados ->> 'prioridade_nova')::int
                             else prioridade end,
           alimentadores = case when jsonb_typeof(v_nov.dados -> 'alimentadores') = 'array'
                                then array(select jsonb_array_elements_text(v_nov.dados -> 'alimentadores'))
                                else alimentadores end
     where projeto = v_nov.projeto;

  elsif v_nov.tipo = 'saiu' then
    if p_escolha is null or p_escolha not in ('MANTER', 'TRANSFERIDA', 'NÃO EXECUTÁVEL') then
      raise exception 'Escolha o que fazer com este projeto.';
    end if;
    v_escolha := p_escolha;
    update public.projetos
       set saiu_da_demanda = true,
           etapa = case when p_escolha = 'MANTER' then etapa else p_escolha end
     where projeto = v_nov.projeto;

  elsif v_nov.tipo = 'corrigido' then
    if p_escolha is null or p_escolha not in ('EXECUTADO', 'TIRAR') then
      raise exception 'Escolha o que fazer com este projeto.';
    end if;
    v_escolha := p_escolha;
    update public.defeitos x
       set situacao    = case when p_escolha = 'EXECUTADO' then 'executado' else 'removido' end,
           estado_enel = coalesce(c.value ->> 'estado_enel', x.estado_enel)
      from jsonb_array_elements(coalesce(v_nov.dados -> 'defeitos', '[]'::jsonb)) c
     where x.id_gom = c.value ->> 'id_gom'
       and x.projeto = v_nov.projeto
       and x.situacao in ('pendente', 'programado');
  end if;

  update public.novidades
     set situacao     = 'aceita',
         escolha      = v_escolha,
         decidida_em  = now(),
         decidida_por = (select auth.uid())
   where id = p_id;
end;
$$;

-- Em lote só novo e mudou (não pedem escolha). Tudo ou nada: o primeiro
-- erro desfaz o lote inteiro e a mensagem dele sobe. Devolve quantas.
create or replace function public.aceitar_novidades(p_ids bigint[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_n  int := 0;
begin
  if not public.eh_admin() then
    raise exception 'Só administrador decide as novidades.';
  end if;

  if exists (select 1 from public.novidades
              where id = any (coalesce(p_ids, '{}'))
                and tipo not in ('novo', 'mudou')) then
    raise exception 'Em lote, só projetos novos e mudanças. Decida os outros um a um.';
  end if;

  -- Na ordem pedida, sem repetir.
  for v_id in
    select u.id from unnest(coalesce(p_ids, '{}')) with ordinality as u (id, ordem)
     group by u.id
     order by min(u.ordem)
  loop
    perform public.aceitar_novidade(v_id, null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.recusar_novidade(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_situacao text;
begin
  if not public.eh_admin() then
    raise exception 'Só administrador decide as novidades.';
  end if;

  select situacao into v_situacao from public.novidades where id = p_id for update;
  if not found then
    raise exception 'Novidade não encontrada.';
  end if;
  if v_situacao <> 'aberta' then
    raise exception 'Esta novidade já foi decidida.';
  end if;

  update public.novidades
     set situacao     = 'recusada',
         decidida_em  = now(),
         decidida_por = (select auth.uid())
   where id = p_id;
end;
$$;

-- A checagem de quem chama fica dentro das funções (eh_admin).
-- criar_projeto_da_demanda é interna: ninguém do site chama direto.
revoke all on function public.criar_projeto_da_demanda(text, jsonb) from public, anon, authenticated;
revoke all on function public.aceitar_novidade(bigint, text) from public, anon;
revoke all on function public.aceitar_novidades(bigint[]) from public, anon;
revoke all on function public.recusar_novidade(bigint) from public, anon;
grant execute on function public.aceitar_novidade(bigint, text) to authenticated;
grant execute on function public.aceitar_novidades(bigint[]) to authenticated;
grant execute on function public.recusar_novidade(bigint) to authenticated;

-- ---------------------------------------------------------------
-- 9. carga_inicial: carteira de partida (xlsm de controle + demanda)
-- ---------------------------------------------------------------
-- Texto para comparar nomes: sem acento e em minúsculas (interna).
create or replace function public.texto_comparavel(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(translate(btrim(coalesce(p_texto, '')),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'));
$$;

-- Perfis do PCM (ativos, admin ou equipe) cujo nome começa com o texto,
-- comparando sem acento e caixa (interna; só a carga_inicial chama).
create or replace function public.perfis_pelo_nome(p_texto text)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(p.id order by p.id), '{}')
    from public.perfis p
   where p.ativo
     and p.papel in ('admin', 'equipe')
     and btrim(p.nome) <> ''
     and public.texto_comparavel(p_texto) <> ''
     and starts_with(public.texto_comparavel(p.nome), public.texto_comparavel(p_texto));
$$;

-- Só administrador ativo, e só uma vez (recusa se já existe importação do
-- tipo carga). O importador (pmrd-carga) manda:
--   projetos:     os do xlsm, já com regional, origem (enel se está entre os
--                 presentes da demanda da regional, senão manual), etapa,
--                 prioridade, campos da vistoria, responsavel (texto) e
--                 defeitos [{id_gom, prioridade, estrutura, alimentador,
--                 estado_enel, lat, lng}];
--   da_demanda:   projetos ativos da demanda que não estão no xlsm
--                 [{regional, projeto, municipio, alimentadores, defeitos}],
--                 criados por criar_projeto_da_demanda (EM ANÁLISE);
--   equipes:      [{lid, chefe, tipo, regional, base, grupo_report}];
--   solicitantes: nomes;
--   avisos:       textos do importador; arquivo: nome do xlsm.
-- Numa transação: (se p_apagar_exemplos) apaga projetos EXEMPLO-%, os defeitos
-- e as novidades deles; insere equipes (a que já existe fica), solicitantes
-- que ainda não existem pelo nome, projetos e defeitos. Projeto que já existe
-- e defeito que já está em outro projeto viram aviso, não erro. O responsável
-- liga ao único perfil cujo nome começa com o texto; sem par único, fica vazio
-- com aviso. Grava importacoes tipo carga com as contagens e os avisos e
-- devolve esse resumo.
create or replace function public.carga_inicial(p_carga jsonb, p_apagar_exemplos boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quando    timestamptz;
  v_avisos    jsonb;
  v_p         jsonb;
  v_d         jsonb;
  v_projeto   text;
  v_outro     text;
  v_ids       uuid[];
  v_n         int;
  v_apagados  int := 0;
  v_equipes   int := 0;
  v_solic     int := 0;
  v_enel      int := 0;
  v_manuais   int := 0;
  v_demanda   int := 0;
  v_def       int := 0;
  v_resumo    jsonb;
begin
  if not public.eh_admin() then
    raise exception 'Só administrador faz a carga inicial.';
  end if;

  -- Uma carga de cada vez; a segunda espera a primeira e depois recusa.
  perform pg_advisory_xact_lock(hashtext('pmrd.carga_inicial'));

  select quando into v_quando from public.importacoes where tipo = 'carga' order by quando limit 1;
  if found then
    raise exception 'A carga inicial já foi feita em %.',
      to_char(v_quando at time zone 'America/Fortaleza', 'DD/MM/YYYY');
  end if;

  -- ---- Conferência da carga (nada é gravado se algo estiver fora) ----
  if p_carga is null
     or jsonb_typeof(p_carga -> 'projetos') is distinct from 'array'
     or jsonb_typeof(p_carga -> 'da_demanda') is distinct from 'array'
     or jsonb_typeof(p_carga -> 'equipes') is distinct from 'array'
     or jsonb_typeof(p_carga -> 'solicitantes') is distinct from 'array'
     or coalesce(jsonb_typeof(p_carga -> 'avisos'), 'array') <> 'array' then
    raise exception 'Carga sem as listas de projetos, projetos da demanda, equipes e solicitantes.';
  end if;

  if exists (select 1
               from (select e.value from jsonb_array_elements(p_carga -> 'projetos') e
                     union all
                     select e.value from jsonb_array_elements(p_carga -> 'da_demanda') e) t
              where jsonb_typeof(t.value) <> 'object'
                 or coalesce(btrim(t.value ->> 'projeto'), '') = ''
                 or coalesce(jsonb_typeof(t.value -> 'defeitos'), 'array') <> 'array') then
    raise exception 'Projeto sem nome ou sem lista de defeitos na carga.';
  end if;

  select format('Defeito sem ID no projeto %s.', t.value ->> 'projeto') into v_outro
    from (select e.value from jsonb_array_elements(p_carga -> 'projetos') e
          union all
          select e.value from jsonb_array_elements(p_carga -> 'da_demanda') e) t,
         jsonb_array_elements(coalesce(t.value -> 'defeitos', '[]'::jsonb)) d
   where jsonb_typeof(d.value) <> 'object'
      or coalesce(btrim(d.value ->> 'id_gom'), '') = ''
   limit 1;
  if found then
    raise exception '%', v_outro;
  end if;

  v_avisos := coalesce(p_carga -> 'avisos', '[]'::jsonb);

  -- ---- Exemplos ----
  if coalesce(p_apagar_exemplos, false) then
    delete from public.novidades where projeto like 'EXEMPLO-%';
    delete from public.defeitos where projeto like 'EXEMPLO-%';
    delete from public.projetos where projeto like 'EXEMPLO-%';
    get diagnostics v_apagados = row_count;
  end if;

  -- ---- Equipes e solicitantes ----
  select v_avisos || coalesce(jsonb_agg(to_jsonb(format(
           'A equipe %s já estava cadastrada e ficou como está.', q.lid)) order by q.lid collate "C"), '[]'::jsonb)
    into v_avisos
    from public.equipes q
   where q.lid in (select btrim(e.value ->> 'lid') from jsonb_array_elements(p_carga -> 'equipes') e);

  insert into public.equipes (lid, chefe, tipo, regional, grupo_report, base)
  select btrim(e.value ->> 'lid'), coalesce(btrim(e.value ->> 'chefe'), ''), e.value ->> 'tipo',
         e.value ->> 'regional', nullif(btrim(e.value ->> 'grupo_report'), ''), nullif(btrim(e.value ->> 'base'), '')
    from jsonb_array_elements(p_carga -> 'equipes') e
  on conflict (lid) do nothing;
  get diagnostics v_equipes = row_count;

  insert into public.solicitantes_sgd (nome)
  select distinct on (public.texto_comparavel(s.nome)) s.nome
    from (select btrim(x) as nome from jsonb_array_elements_text(p_carga -> 'solicitantes') x) s
   where s.nome <> ''
     and not exists (select 1 from public.solicitantes_sgd o
                      where public.texto_comparavel(o.nome) = public.texto_comparavel(s.nome));
  get diagnostics v_solic = row_count;

  -- ---- Projetos do xlsm ----
  for v_p in select e.value from jsonb_array_elements(p_carga -> 'projetos') e loop
    v_projeto := btrim(v_p ->> 'projeto');
    if exists (select 1 from public.projetos where projeto = v_projeto) then
      v_avisos := v_avisos || to_jsonb(format('O projeto %s já está na carteira e ficou de fora da carga.', v_projeto));
      continue;
    end if;

    v_ids := public.perfis_pelo_nome(v_p ->> 'responsavel');

    insert into public.projetos (
      projeto, regional, origem, ot_correcao, municipio, endereco, prioridade, alimentadores,
      elemento_corte, qtd_clientes, estruturas, intervencao_prevista, etapa, proxima_acao,
      prazo_proxima_acao, vistoria_data, vistoria_situacao, vistoria_recurso, vistoria_intervencao,
      vistoria_observacao, vistoria_enviada_em, responsavel, qtd_defeitos_informada, lat, lng)
    select v_projeto, v_p ->> 'regional', v_p ->> 'origem',
           nullif(btrim(v_p ->> 'ot_correcao'), ''), nullif(btrim(v_p ->> 'municipio'), ''),
           nullif(btrim(v_p ->> 'endereco'), ''), (v_p ->> 'prioridade')::int,
           array(select jsonb_array_elements_text(coalesce(v_p -> 'alimentadores', '[]'::jsonb))),
           nullif(btrim(v_p ->> 'elemento_corte'), ''), (v_p ->> 'qtd_clientes')::int,
           array(select jsonb_array_elements_text(coalesce(v_p -> 'estruturas', '[]'::jsonb))),
           nullif(btrim(v_p ->> 'intervencao_prevista'), ''), v_p ->> 'etapa',
           nullif(btrim(v_p ->> 'proxima_acao'), ''), (v_p ->> 'prazo_proxima_acao')::date,
           (v_p ->> 'vistoria_data')::date, nullif(btrim(v_p ->> 'vistoria_situacao'), ''),
           nullif(btrim(v_p ->> 'vistoria_recurso'), ''), nullif(btrim(v_p ->> 'vistoria_intervencao'), ''),
           nullif(btrim(v_p ->> 'vistoria_observacao'), ''), (v_p ->> 'vistoria_enviada_em')::date,
           case when cardinality(v_ids) = 1 then v_ids[1] end,
           (v_p ->> 'qtd_defeitos_informada')::int,
           c.lat, c.lng
      from (select avg((d.value ->> 'lat')::double precision) as lat,
                   avg((d.value ->> 'lng')::double precision) as lng
              from jsonb_array_elements(coalesce(v_p -> 'defeitos', '[]'::jsonb)) d
             where jsonb_typeof(d.value -> 'lat') = 'number'
               and jsonb_typeof(d.value -> 'lng') = 'number') c;

    if v_p ->> 'origem' = 'enel' then
      v_enel := v_enel + 1;
    else
      v_manuais := v_manuais + 1;
    end if;

    for v_d in select d.value from jsonb_array_elements(coalesce(v_p -> 'defeitos', '[]'::jsonb)) d
                order by d.value ->> 'id_gom' collate "C"
    loop
      select projeto into v_outro from public.defeitos where id_gom = btrim(v_d ->> 'id_gom');
      if found then
        v_avisos := v_avisos || to_jsonb(format('O defeito %s já está no projeto %s e ficou de fora do projeto %s.',
                                                btrim(v_d ->> 'id_gom'), v_outro, v_projeto));
        continue;
      end if;
      insert into public.defeitos (id_gom, projeto, prioridade, estrutura, alimentador, estado_enel, situacao, lat, lng)
      values (btrim(v_d ->> 'id_gom'), v_projeto,
              case when jsonb_typeof(v_d -> 'prioridade') = 'number' then (v_d ->> 'prioridade')::int end,
              v_d ->> 'estrutura', v_d ->> 'alimentador', v_d ->> 'estado_enel', 'pendente',
              case when jsonb_typeof(v_d -> 'lat') = 'number' then (v_d ->> 'lat')::double precision end,
              case when jsonb_typeof(v_d -> 'lng') = 'number' then (v_d ->> 'lng')::double precision end);
      v_def := v_def + 1;
    end loop;
  end loop;

  -- ---- Projetos ativos da demanda que não estão no xlsm ----
  for v_p in select e.value from jsonb_array_elements(p_carga -> 'da_demanda') e loop
    v_projeto := btrim(v_p ->> 'projeto');
    if exists (select 1 from public.projetos where projeto = v_projeto) then
      v_avisos := v_avisos || to_jsonb(format('O projeto %s já está na carteira e ficou de fora da carga.', v_projeto));
      continue;
    end if;

    -- Defeito que já está em outro projeto: aviso, e sai dos dados.
    select v_avisos || coalesce(jsonb_agg(to_jsonb(format(
             'O defeito %s já está no projeto %s e ficou de fora do projeto %s.', x.id_gom, x.projeto, v_projeto))
             order by x.id_gom collate "C"), '[]'::jsonb)
      into v_avisos
      from jsonb_array_elements(coalesce(v_p -> 'defeitos', '[]'::jsonb)) d
      join public.defeitos x on x.id_gom = d.value ->> 'id_gom';

    v_p := jsonb_set(v_p, '{defeitos}', (
      select coalesce(jsonb_agg(d.value), '[]'::jsonb)
        from jsonb_array_elements(coalesce(v_p -> 'defeitos', '[]'::jsonb)) d
       where not exists (select 1 from public.defeitos x where x.id_gom = d.value ->> 'id_gom')));

    perform public.criar_projeto_da_demanda(v_p ->> 'regional', v_p);
    v_demanda := v_demanda + 1;
    v_def := v_def + jsonb_array_length(v_p -> 'defeitos');
  end loop;

  -- ---- Responsáveis sem par único (um aviso por texto) ----
  for v_p in
    select jsonb_build_object('texto', t.texto, 'n', count(*)) as value
      from (select btrim(e.value ->> 'responsavel') as texto
              from jsonb_array_elements(p_carga -> 'projetos') e
             where coalesce(btrim(e.value ->> 'responsavel'), '') <> '') t
     group by t.texto
     order by t.texto collate "C"
  loop
    v_n := cardinality(public.perfis_pelo_nome(v_p ->> 'texto'));
    continue when v_n = 1;
    v_avisos := v_avisos || to_jsonb(format('Responsável "%s" %s: %s %s sem responsável.',
      v_p ->> 'texto',
      case when v_n = 0 then 'sem perfil no PMRD' else 'combina com mais de um perfil' end,
      v_p ->> 'n',
      case when (v_p ->> 'n')::int = 1 then 'projeto ficou' else 'projetos ficaram' end));
  end loop;

  v_resumo := jsonb_build_object(
    'projetos_enel', v_enel,
    'projetos_manuais', v_manuais,
    'projetos_da_demanda', v_demanda,
    'defeitos', v_def,
    'equipes', v_equipes,
    'solicitantes', v_solic,
    'exemplos_apagados', v_apagados,
    'avisos', v_avisos);

  insert into public.importacoes (tipo, regional, arquivo, resumo)
  values ('carga', null, coalesce(btrim(p_carga ->> 'arquivo'), ''), v_resumo);
  return v_resumo;
end;
$$;

-- A checagem de quem chama fica dentro da função (eh_admin); as auxiliares são internas.
revoke all on function public.texto_comparavel(text) from public, anon, authenticated;
revoke all on function public.perfis_pelo_nome(text) from public, anon, authenticated;
revoke all on function public.carga_inicial(jsonb, boolean) from public, anon;
grant execute on function public.carga_inicial(jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------
-- 10. Tipos de equipe: além de ML, LVR, MP e LV, as siglas das listas de
--     equipes (RD, LB, LN, MM, SK, GA, TR, RL, LM, MO). Pode rodar de novo.
-- ---------------------------------------------------------------
alter table public.equipes drop constraint if exists equipes_tipo_check;
alter table public.equipes add constraint equipes_tipo_check
  check (tipo in ('ML', 'LVR', 'MP', 'LV', 'RD', 'LB', 'LN', 'MM', 'SK', 'GA', 'TR', 'RL', 'LM', 'MO'));
