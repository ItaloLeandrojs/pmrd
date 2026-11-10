-- PMRD: DADOS DE EXEMPLO (tudo aqui é EXEMPLO, nada é dado real).
-- Rode depois do 001_base.sql (SQL Editor -> colar tudo -> Run). Pode rodar de novo
-- sem erro: o que já existe fica como está (on conflict do nothing).
--
-- O que entra: 9 equipes EXEMPLO-ML-01..03, EXEMPLO-LVR-01..03 e EXEMPLO-MP-01..03
-- (uma de cada tipo por regional), 60 projetos EXEMPLO-0001..0060 e de 1 a 8 defeitos
-- EXEMPLO-D0001-1 etc. por projeto. Os municípios são cidades reais do Ceará, que não
-- são dado da empresa. Não entra nada em perfis nem em auth: as contas vêm pela função usuarios.
--
-- Datas: relativas a current_date, para vistorias vencidas e vencendo e prazos atrasados
-- continuarem fazendo sentido em qualquer dia em que o exemplo for carregado
-- (as validades usam os parâmetros padrão: 45 dias de validade, alerta de 7 dias).
-- O Supabase conta o dia em UTC, então perto da meia-noite pode haver 1 dia de diferença
-- em relação a Fortaleza; para dados de exemplo isso não importa.
-- Para renovar as datas, limpe e carregue de novo.
--
-- PARA LIMPAR (tire o -- do começo das linhas e rode; a ordem importa: defeitos antes
-- de projetos, porque defeitos aponta para projetos, e o histórico por último, porque
-- apagar também grava no histórico):
--   delete from public.defeitos where projeto like 'EXEMPLO-%';
--   delete from public.projetos where projeto like 'EXEMPLO-%';
--   delete from public.equipes where lid like 'EXEMPLO-%';
--   delete from public.historico where (tabela = 'projetos' and chave like 'EXEMPLO-%')
--                                   or (tabela = 'defeitos' and chave like 'EXEMPLO-D%');

-- ---------------------------------------------------------------
-- 1. Equipes de exemplo (3 por regional: ML, LVR e MP)
-- ---------------------------------------------------------------
insert into public.equipes (lid, chefe, tipo, regional, grupo_report, base)
select 'EXEMPLO-' || t.tipo || '-' || lpad(r.n::text, 2, '0'),
       'EXEMPLO',
       t.tipo,
       r.regional,
       'EXEMPLO',
       'BASE EXEMPLO'
  from (values ('ML'), ('LVR'), ('MP')) as t (tipo),
       (values (1, 'CS'), (2, 'SUL'), (3, 'LESTE')) as r (n, regional)
on conflict (lid) do nothing;

-- ---------------------------------------------------------------
-- 2. Projetos de exemplo (60), espalhados pelas 12 etapas
-- ---------------------------------------------------------------
-- i % 12 escolhe a etapa; i % 11 a prioridade (1 a 11); (i + i / 12) % 3 a regional;
-- i % 5 a situação da vistoria (junto com a etapa, cobre todas as combinações).
-- Vistoria a partir de ANÁLISE PÓS-VISTORIA: 60 dias atrás = vencida,
-- 40 = vencendo (5 dias de sobra), 25 e 10 = válida, e sem data em 1 de cada 5.
insert into public.projetos (
  projeto, regional, origem, ot_correcao, municipio, endereco, prioridade,
  pedido_gestor, pedido_gestor_em, pedido_gestor_por,
  alimentadores, elemento_corte, qtd_clientes, estruturas, intervencao_prevista,
  etapa, etapa_desde, proxima_acao, prazo_proxima_acao,
  vistoria_data, vistoria_situacao, vistoria_recurso, vistoria_intervencao,
  vistoria_enviada_em, qtd_defeitos_informada, lat, lng
)
select
  'EXEMPLO-' || lpad(g.i::text, 4, '0'),
  (array['CS', 'SUL', 'LESTE'])[(g.i + g.i / 12) % 3 + 1],
  'manual',
  'EXEMPLO-OT-' || lpad(g.i::text, 4, '0'),
  (array['Fortaleza', 'Caucaia', 'Maracanaú', 'Sobral', 'Juazeiro do Norte', 'Crato',
         'Iguatu', 'Icó', 'Quixadá', 'Aracati', 'Itapipoca', 'Russas'])[g.i / 5 % 12 + 1],
  'EXEMPLO, campo ' || g.i,
  g.i % 11 + 1,
  g.i % 10 = 0,
  case when g.i % 10 = 0 then current_date - (g.i % 6) end,
  case when g.i % 10 = 0 then 'EXEMPLO' end,
  array['EXEMPLO-AL-' || lpad((g.i % 7 + 1)::text, 2, '0')],
  'EXEMPLO-CHAVE-' || lpad((g.i % 9 + 1)::text, 2, '0'),
  50 + (g.i * 37) % 900,
  array['EXEMPLO-EST-' || (g.i % 5 + 1)],
  (array['DESL MT', 'TROCA DE POSTE', 'TROCA DE CRUZETA', 'TROCA DE CABO'])[g.i % 4 + 1],
  e.etapa,
  now() - make_interval(days => g.i % 25),
  case when e.etapa in ('EXECUTADA', 'TRANSFERIDA', 'NÃO EXECUTÁVEL') then null
       else 'EXEMPLO: acompanhar ' || lower(e.etapa) end,
  case when e.etapa in ('EXECUTADA', 'TRANSFERIDA', 'NÃO EXECUTÁVEL') then null
       else current_date + (g.i % 9 - 3) end,
  case when e.idx < 3 or g.i % 5 = 0 then null
       else current_date - (array[60, 40, 10, 25])[g.i % 5] end,
  case when e.idx < 3 or g.i % 5 = 0 then null else 'REALIZADA' end,
  case when e.idx < 3 or g.i % 5 = 0 then null else 'EXEMPLO' end,
  case when e.idx < 3 or g.i % 5 = 0 then null else 'EXEMPLO' end,
  case when e.idx < 3 or g.i % 5 = 0 then null
       else current_date - (array[60, 40, 10, 25])[g.i % 5] + 2 end,
  g.i % 8 + 1,
  -3.73 + (g.i % 13) * 0.011,
  -38.52 + (g.i % 17) * 0.009
from generate_series(1, 60) as g (i)
cross join lateral (
  select g.i % 12 as idx,
         (array[
           'EM ANÁLISE', 'SOLICITAR VISTORIA', 'AGUARDANDO VISTORIA', 'ANÁLISE PÓS-VISTORIA',
           'PROGRAMAR EXECUÇÃO', 'SOLICITAR SGD', 'AGUARDANDO SGD', 'PROGRAMADA',
           'PENDENTE DE RETORNO', 'EXECUTADA', 'TRANSFERIDA', 'NÃO EXECUTÁVEL'
         ])[g.i % 12 + 1] as etapa
) as e
on conflict (projeto) do nothing;

-- ---------------------------------------------------------------
-- 3. Defeitos de exemplo: de 1 a 8 por projeto (o mesmo número de
--    qtd_defeitos_informada), com ID GOM EXEMPLO-D0001-1 etc.
-- ---------------------------------------------------------------
insert into public.defeitos (id_gom, projeto, prioridade, estrutura, alimentador, estado_enel, situacao, lat, lng)
select
  'EXEMPLO-D' || lpad(substring(p.projeto from 9), 4, '0') || '-' || k.n,
  p.projeto,
  (p.prioridade + k.n) % 11 + 1,
  'EXEMPLO-EST-' || (k.n % 5 + 1),
  p.alimentadores[1],
  'EXEMPLO',
  case when p.etapa = 'EXECUTADA' then 'executado'
       when p.etapa = 'PROGRAMADA' then 'programado'
       when k.n = p.qtd_defeitos_informada and k.n > 2 and p.prioridade % 3 = 0 then 'removido'
       else 'pendente' end,
  p.lat + k.n * 0.0004,
  p.lng + k.n * 0.0004
from public.projetos p
cross join lateral generate_series(1, p.qtd_defeitos_informada) as k (n)
where p.projeto like 'EXEMPLO-%'
on conflict (id_gom) do nothing;
