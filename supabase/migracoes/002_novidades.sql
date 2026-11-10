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
