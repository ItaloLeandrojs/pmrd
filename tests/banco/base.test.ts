import type { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ETAPAS } from '../../src/dominio/etapas'
import { aplicarMigracoes, como, criarPessoa, novoBanco } from './apoio'

const PROJETO = 'EXEMPLO-0001'
const ANTIGO = '2026-01-01T00:00:00Z'

let modelo: PGlite
let db: PGlite

// Montar o banco do zero leva uns 4 s; cada teste ganha uma cópia (clone) dele.
beforeAll(async () => {
  modelo = await novoBanco()
}, 60_000)

afterAll(async () => {
  await modelo.close()
})

beforeEach(async () => {
  db = (await modelo.clone()) as PGlite
  // Projeto fictício criado "pelo importador" (superusuário), com datas antigas
  // para dar para ver que os gatilhos mudam etapa_desde e atualizado_em.
  await db.query(
    `insert into public.projetos (projeto, regional, municipio, etapa_desde, atualizado_em)
     values ($1, 'SUL', 'EXEMPLO', $2, $2)`,
    [PROJETO, ANTIGO],
  )
})

afterEach(async () => {
  await db.close()
})

/** Espera erro do banco; devolve a mensagem. */
async function falha(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa
  } catch (e) {
    return (e as Error).message
  }
  throw new Error('era para dar erro e não deu')
}

describe('acesso de quem não entrou (anon)', () => {
  it('não lê nenhum projeto, mesmo com projeto existente', async () => {
    let linhas: unknown[] = []
    try {
      linhas = await como(db, 'anon', 'select * from public.projetos')
    } catch (e) {
      expect((e as Error).message).toMatch(/permission denied/)
      return
    }
    expect(linhas).toHaveLength(0)
  })
})

describe('pessoa da equipe', () => {
  it('ativa lê projetos e muda a etapa; etapa_desde e atualizado_em mudam', async () => {
    const eu = await criarPessoa(db, { papel: 'equipe' })
    const lidos = await como(db, { id: eu }, 'select projeto from public.projetos')
    expect(lidos).toEqual([{ projeto: PROJETO }])

    await como(db, { id: eu }, `update public.projetos set etapa = 'SOLICITAR VISTORIA' where projeto = $1`, [
      PROJETO,
    ])

    const [p] = await como<{ etapa: string; etapa_desde: Date; atualizado_em: Date }>(
      db,
      { id: eu },
      'select etapa, etapa_desde, atualizado_em from public.projetos where projeto = $1',
      [PROJETO],
    )
    expect(p.etapa).toBe('SOLICITAR VISTORIA')
    expect(p.etapa_desde.getTime()).toBeGreaterThan(new Date(ANTIGO).getTime())
    expect(p.atualizado_em.getTime()).toBeGreaterThan(new Date(ANTIGO).getTime())
  })

  it('inativa lê 0 linhas', async () => {
    const eu = await criarPessoa(db, { papel: 'equipe', ativo: false })
    expect(await como(db, { id: eu }, 'select * from public.projetos')).toHaveLength(0)
  })

  it('não grava em motivos; admin grava', async () => {
    const equipe = await criarPessoa(db, { papel: 'equipe' })
    const admin = await criarPessoa(db, { papel: 'admin' })
    const sql = `insert into public.motivos (nome, ordem) values ('EXEMPLO DE MOTIVO', 99)`
    expect(await falha(como(db, { id: equipe }, sql))).toMatch(/row-level security|permission denied/)
    await como(db, { id: admin }, sql)
    const [{ n }] = await db.query<{ n: number }>(
      `select count(*)::int as n from public.motivos where nome = 'EXEMPLO DE MOTIVO'`,
    ).then((r) => r.rows)
    expect(n).toBe(1)
  })

  it('não se promove a admin mexendo em perfis', async () => {
    const eu = await criarPessoa(db, { papel: 'equipe' })
    expect(await falha(como(db, { id: eu }, `update public.perfis set papel = 'admin' where id = $1`, [eu]))).toMatch(
      /permission denied/,
    )
    const { rows } = await db.query<{ papel: string }>('select papel from public.perfis where id = $1', [eu])
    expect(rows[0].papel).toBe('equipe')
  })

  it('não escreve direto no histórico', async () => {
    const eu = await criarPessoa(db, { papel: 'admin' })
    const sql = `insert into public.historico (tabela, chave, operacao) values ('projetos', 'X', 'UPDATE')`
    expect(await falha(como(db, { id: eu }, sql))).toMatch(/permission denied/)
  })

  it('não muda a origem do projeto', async () => {
    const eu = await criarPessoa(db, { papel: 'equipe' })
    const msg = await falha(
      como(db, { id: eu }, `update public.projetos set origem = 'enel' where projeto = $1`, [PROJETO]),
    )
    expect(msg).toContain('Projeto e origem não mudam depois de criados.')
  })
})

describe('apagar projeto', () => {
  it.each(['equipe', 'admin'] as const)('%s não apaga projeto', async (papel) => {
    const eu = await criarPessoa(db, { papel })
    expect(await falha(como(db, { id: eu }, 'delete from public.projetos where projeto = $1', [PROJETO]))).toMatch(
      /permission denied/,
    )
    const { rows } = await db.query('select 1 from public.projetos where projeto = $1', [PROJETO])
    expect(rows).toHaveLength(1)
  })
})

describe('configuração não se apaga, só se desativa', () => {
  it.each([
    ['motivos', `insert into public.motivos (nome, ordem) values ('EXEMPLO DE MOTIVO', 99)`, `nome = 'EXEMPLO DE MOTIVO'`],
    ['solicitantes_sgd', `insert into public.solicitantes_sgd (nome) values ('EXEMPLO')`, `nome = 'EXEMPLO'`],
    [
      'equipes',
      `insert into public.equipes (lid, chefe, tipo, regional) values ('EXEMPLO-ML-01', 'EXEMPLO', 'ML', 'SUL')`,
      `lid = 'EXEMPLO-ML-01'`,
    ],
  ])('admin não apaga em %s', async (tabela, inserir, onde) => {
    await db.query(inserir)
    const admin = await criarPessoa(db, { papel: 'admin' })
    expect(await falha(como(db, { id: admin }, `delete from public.${tabela} where ${onde}`))).toMatch(
      /permission denied/,
    )
    const { rows } = await db.query(`select 1 from public.${tabela} where ${onde}`)
    expect(rows).toHaveLength(1)
  })

  it('admin desativa motivo', async () => {
    const admin = await criarPessoa(db, { papel: 'admin' })
    await como(db, { id: admin }, `update public.motivos set ativo = false where nome = 'MATERIAL'`)
    const { rows } = await db.query<{ ativo: boolean }>(`select ativo from public.motivos where nome = 'MATERIAL'`)
    expect(rows[0].ativo).toBe(false)
  })
})

describe('carimbos de data do projeto', () => {
  it('equipe não reescreve etapa_desde (sem mudar a etapa) nem criado_em', async () => {
    const eu = await criarPessoa(db, { papel: 'equipe' })
    const ler = () =>
      db
        .query<{ etapa_desde: Date; criado_em: Date }>(
          'select etapa_desde, criado_em from public.projetos where projeto = $1',
          [PROJETO],
        )
        .then((r) => r.rows[0])
    const antes = await ler()
    await como(
      db,
      { id: eu },
      `update public.projetos set etapa_desde = '2020-05-05T00:00:00Z', criado_em = '2020-05-05T00:00:00Z'
        where projeto = $1`,
      [PROJETO],
    )
    const depois = await ler()
    expect(depois.etapa_desde.getTime()).toBe(antes.etapa_desde.getTime())
    expect(depois.criado_em.getTime()).toBe(antes.criado_em.getTime())
  })
})

describe('service_role (importador)', () => {
  it('pode mudar a origem', async () => {
    await como(db, 'service', `update public.projetos set origem = 'enel' where projeto = $1`, [PROJETO])
    const { rows } = await db.query<{ origem: string }>('select origem from public.projetos where projeto = $1', [
      PROJETO,
    ])
    expect(rows[0].origem).toBe('enel')
  })
})

describe('histórico', () => {
  it('guarda quem mudou a etapa e só os campos que mudaram', async () => {
    const x = await criarPessoa(db, { papel: 'equipe' })
    await como(db, { id: x }, `update public.projetos set etapa = 'SOLICITAR VISTORIA' where projeto = $1`, [PROJETO])

    const linhas = await como<{
      tabela: string
      chave: string
      operacao: string
      antes: Record<string, unknown>
      depois: Record<string, unknown>
    }>(db, { id: x }, 'select tabela, chave, operacao, antes, depois from public.historico where quem = $1', [x])
    expect(linhas).toHaveLength(1)
    const [h] = linhas
    expect(h.tabela).toBe('projetos')
    expect(h.chave).toBe(PROJETO)
    expect(h.operacao).toBe('UPDATE')
    expect(h.antes).toEqual({ etapa: 'EM ANÁLISE' })
    expect(h.depois).toEqual({ etapa: 'SOLICITAR VISTORIA' })
  })
})

describe('preferências', () => {
  it('guardar_preferencias muda só o perfil de quem chamou', async () => {
    const eu = await criarPessoa(db, { papel: 'equipe' })
    const outro = await criarPessoa(db, { papel: 'equipe' })
    await como(db, { id: eu }, `select public.guardar_preferencias('SUL', 'escuro')`)

    const { rows } = await db.query<{ id: string; regional_preferida: string; tema: string }>(
      'select id, regional_preferida, tema from public.perfis where id in ($1, $2)',
      [eu, outro],
    )
    const porId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(porId[eu]).toMatchObject({ regional_preferida: 'SUL', tema: 'escuro' })
    expect(porId[outro]).toMatchObject({ regional_preferida: 'TODAS', tema: 'sistema' })
  })

  it('marcar_senha_trocada desliga a senha provisória de quem chamou', async () => {
    const eu = await criarPessoa(db, { papel: 'equipe' })
    await como(db, { id: eu }, 'select public.marcar_senha_trocada()')
    const { rows } = await db.query<{ senha_provisoria: boolean }>(
      'select senha_provisoria from public.perfis where id = $1',
      [eu],
    )
    expect(rows[0].senha_provisoria).toBe(false)
  })
})

describe('arquivo 001_base.sql', () => {
  it('traz os 8 motivos e pode rodar de novo sem erro nem duplicar', async () => {
    const contar = async () =>
      (await db.query<{ n: number }>('select count(*)::int as n from public.motivos')).rows[0].n
    expect(await contar()).toBe(8)
    await aplicarMigracoes(db)
    expect(await contar()).toBe(8)
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.parametros')
    expect(rows[0].n).toBe(1)
  })

  it('aceita no check de etapa exatamente as 12 etapas do domínio', async () => {
    for (const etapa of ETAPAS) {
      await db.query('update public.projetos set etapa = $2 where projeto = $1', [PROJETO, etapa])
    }
    const { rows } = await db.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'public.projetos'::regclass and conname = 'projetos_etapa_check'`,
    )
    const noCheck = [...rows[0].def.matchAll(/'([^']+)'::text/g)].map((m) => m[1])
    expect(noCheck).toEqual([...ETAPAS])
  })

  it('o banco recusa etapa fora da lista', async () => {
    const eu = await criarPessoa(db, { papel: 'equipe' })
    expect(
      await falha(como(db, { id: eu }, `update public.projetos set etapa = 'SGD CONFIRMADO' where projeto = $1`, [PROJETO])),
    ).toMatch(/check constraint/)
  })
})
