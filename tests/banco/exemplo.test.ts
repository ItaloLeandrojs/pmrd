import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ETAPAS } from '../../src/dominio/etapas'
import { como, criarPessoa, novoBanco } from './apoio'

const SQL = readFileSync(fileURLToPath(new URL('../../supabase/exemplo.sql', import.meta.url)), 'utf8')

// As linhas de limpeza ficam comentadas no topo do arquivo (logo depois de "PARA LIMPAR");
// aqui tiramos o "--" delas.
const LINHAS = SQL.split(/\r?\n/)
const LIMPEZA = LINHAS.slice(LINHAS.findIndex((l) => l.includes('PARA LIMPAR')) + 1)
  .filter((l) => l.startsWith('--   '))
  .slice(0, 7)
  .map((l) => l.replace(/^--\s+/, ''))
  .join('\n')

let db: PGlite

async function n(sql: string): Promise<number> {
  return (await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`)).rows[0].n
}

beforeAll(async () => {
  db = await novoBanco()
  await db.exec(SQL)
}, 60_000)

afterAll(async () => {
  await db.close()
})

describe('arquivo exemplo.sql', () => {
  it('cria 9 equipes de exemplo, uma de cada tipo ML, LVR e MP por regional', async () => {
    const { rows } = await db.query<{ regional: string; tipo: string; lid: string }>(
      `select regional, tipo, lid from public.equipes order by lid`,
    )
    expect(rows).toHaveLength(9)
    expect(rows.every((r) => r.lid.startsWith('EXEMPLO-'))).toBe(true)
    for (const regional of ['CS', 'SUL', 'LESTE']) {
      expect(rows.filter((r) => r.regional === regional).map((r) => r.tipo).sort()).toEqual(['LVR', 'ML', 'MP'])
    }
  })

  it('cria 60 projetos EXEMPLO nas 3 regionais, nas 12 etapas e nas 11 prioridades', async () => {
    expect(await n(`public.projetos where projeto like 'EXEMPLO-%'`)).toBe(60)
    expect(await n('public.projetos')).toBe(60)
    const etapas = (await db.query<{ e: string }>(`select distinct etapa as e from public.projetos`)).rows
    expect(etapas.map((r) => r.e).sort()).toEqual([...ETAPAS].sort())
    expect(await n('(select distinct regional from public.projetos) r')).toBe(3)
    expect(await n('(select distinct prioridade from public.projetos) r')).toBe(11)
  })

  it('tem vistoria vencida, vencendo e válida, e prazos atrasados e a vencer', async () => {
    const { rows } = await db.query<{ situacao: string; n: number }>(
      `select case when vistoria_data is null then 'sem'
                   when vistoria_data + 45 < current_date then 'vencida'
                   when vistoria_data + 45 <= current_date + 7 then 'vencendo'
                   else 'valida' end as situacao,
              count(*)::int as n
         from public.projetos group by 1`,
    )
    const por = Object.fromEntries(rows.map((r) => [r.situacao, r.n]))
    for (const s of ['sem', 'vencida', 'vencendo', 'valida']) expect(por[s]).toBeGreaterThan(0)
    expect(await n('public.projetos where prazo_proxima_acao < current_date')).toBeGreaterThan(0)
    expect(await n('public.projetos where prazo_proxima_acao between current_date and current_date + 3')).toBeGreaterThan(0)
  })

  it('cada projeto tem de 1 a 8 defeitos, no número informado, com ID GOM EXEMPLO-D', async () => {
    const { rows } = await db.query<{ projeto: string; qtd: number; informada: number }>(
      `select p.projeto, count(d.id_gom)::int as qtd, p.qtd_defeitos_informada as informada
         from public.projetos p left join public.defeitos d on d.projeto = p.projeto
        group by p.projeto, p.qtd_defeitos_informada`,
    )
    expect(rows).toHaveLength(60)
    for (const r of rows) {
      expect(r.qtd).toBeGreaterThanOrEqual(1)
      expect(r.qtd).toBeLessThanOrEqual(8)
      expect(r.qtd).toBe(r.informada)
    }
    expect(await n(`public.defeitos where id_gom not like 'EXEMPLO-D%'`)).toBe(0)
  })

  it('cria 1 importação do CS e 4 novidades abertas EXEMPLO, uma de cada tipo', async () => {
    const imp = await db.query<{ regional: string; tipo: string; arquivo: string }>(`select regional, tipo, arquivo from public.importacoes`)
    expect(imp.rows).toEqual([{ regional: 'CS', tipo: 'demanda', arquivo: 'EXEMPLO-00_DEMANDA.xlsx' }])
    const { rows } = await db.query<{ tipo: string; projeto: string; situacao: string; regional: string }>(
      `select tipo, projeto, situacao, regional from public.novidades order by tipo`,
    )
    expect(rows.map((r) => r.tipo)).toEqual(['corrigido', 'mudou', 'novo', 'saiu'])
    expect(rows.every((r) => r.projeto.startsWith('EXEMPLO-') && r.situacao === 'aberta' && r.regional === 'CS')).toBe(true)
  })

  it('não mexe em perfis nem em contas', async () => {
    expect(await n('public.perfis')).toBe(0)
    expect(await n('auth.users')).toBe(0)
  })

  it('pode rodar de novo sem erro nem duplicar', async () => {
    await db.exec(SQL)
    expect(await n('public.equipes')).toBe(9)
    expect(await n('public.projetos')).toBe(60)
    expect(await n('public.importacoes')).toBe(1)
    expect(await n('public.novidades')).toBe(4)
  })

  it('o delete de limpeza (defeitos antes de projetos) tira tudo e deixa o resto', async () => {
    expect(LIMPEZA).toMatch(/delete from public\.novidades[\s\S]*delete from public\.importacoes[\s\S]*delete from public\.defeitos[\s\S]*delete from public\.projetos/)
    await db.exec(LIMPEZA)
    expect(await n('public.defeitos')).toBe(0)
    expect(await n('public.projetos')).toBe(0)
    expect(await n('public.equipes')).toBe(0)
    expect(await n('public.historico')).toBe(0)
    expect(await n('public.novidades')).toBe(0)
    expect(await n('public.importacoes')).toBe(0)
    expect(await n('public.motivos')).toBe(8)
  })
})

describe('novidades do exemplo.sql com as funções do banco', () => {
  let banco: PGlite
  beforeAll(async () => {
    banco = await novoBanco()
    await banco.exec(SQL)
  }, 60_000)
  afterAll(async () => { await banco.close() })

  it('o administrador aceita as 4 (cada uma com a escolha do seu tipo) sem erro', async () => {
    const admin = await criarPessoa(banco, { papel: 'admin' })
    const nov = (await banco.query<{ id: number; tipo: string }>(`select id, tipo from public.novidades`)).rows
    const escolha: Record<string, string | null> = { novo: null, mudou: null, saiu: 'MANTER', corrigido: 'EXECUTADO' }
    for (const x of nov) await como(banco, { id: admin }, 'select public.aceitar_novidade($1, $2)', [x.id, escolha[x.tipo]])
    const abertas = await banco.query<{ n: number }>(`select count(*)::int as n from public.novidades where situacao = 'aberta'`)
    expect(abertas.rows[0].n).toBe(0)
    const novo = await banco.query<{ prioridade: number }>(`select prioridade from public.projetos where projeto = 'EXEMPLO-0061'`)
    expect(novo.rows).toEqual([{ prioridade: 7 }])
    const saiu = await banco.query<{ saiu_da_demanda: boolean }>(`select saiu_da_demanda from public.projetos where projeto = 'EXEMPLO-0006'`)
    expect(saiu.rows).toEqual([{ saiu_da_demanda: true }])
  })
})
