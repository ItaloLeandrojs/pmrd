import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { aplicarMigracoes, como, criarPessoa, novoBanco } from './apoio'

let modelo: PGlite
let db: PGlite

beforeAll(async () => {
  modelo = await novoBanco()
}, 60_000)

afterAll(async () => {
  await modelo.close()
})

beforeEach(async () => {
  db = (await modelo.clone()) as PGlite
  await db.query(`insert into public.projetos (projeto, regional) values ('EXEMPLO-0001', 'SUL')`)
  await db.query(
    `insert into public.importacoes (tipo, regional, arquivo) values ('demanda', 'SUL', 'EXEMPLO-demanda.xlsx')`,
  )
  await db.query(
    `insert into public.novidades (importacao_id, regional, projeto, tipo, dados, assinatura)
     values (1, 'SUL', 'EXEMPLO-0001', 'novo', '{}', 'EXEMPLO-assinatura')`,
  )
})

describe('002_novidades: importador', () => {
  it('importador ativo não é do PCM e não vê projetos nem novidades', async () => {
    const id = await criarPessoa(db, { papel: 'importador' })
    expect(await como(db, { id }, 'select count(*)::int as n from public.projetos')).toEqual([{ n: 0 }])
    expect(await como(db, { id }, 'select count(*)::int as n from public.novidades')).toEqual([{ n: 0 }])
    expect(await como(db, { id }, 'select count(*)::int as n from public.importacoes')).toEqual([{ n: 0 }])
    expect(await como(db, { id }, 'select public.eh_do_pcm() as v')).toEqual([{ v: false }])
    expect(await como(db, { id }, 'select public.eh_importador() as v')).toEqual([{ v: true }])
  })

  it('importador não escreve em novidades', async () => {
    const id = await criarPessoa(db, { papel: 'importador' })
    await expect(
      como(
        db,
        { id },
        `insert into public.novidades (importacao_id, regional, projeto, tipo, dados, assinatura)
         values (1, 'SUL', 'EXEMPLO-0002', 'novo', '{}', 'x')`,
      ),
    ).rejects.toThrow()
  })

  it('o importador ainda lê o próprio perfil', async () => {
    const id = await criarPessoa(db, { papel: 'importador' })
    expect(await como(db, { id }, 'select papel from public.perfis')).toEqual([{ papel: 'importador' }])
  })

  it('importador desativado não é importador', async () => {
    const id = await criarPessoa(db, { papel: 'importador', ativo: false })
    expect(await como(db, { id }, 'select public.eh_importador() as v')).toEqual([{ v: false }])
  })

  it('equipe lê novidades e importações, mas não escreve', async () => {
    const id = await criarPessoa(db, { papel: 'equipe' })
    expect(await como(db, { id }, 'select count(*)::int as n from public.novidades')).toEqual([{ n: 1 }])
    expect(await como(db, { id }, 'select count(*)::int as n from public.importacoes')).toEqual([{ n: 1 }])
    await expect(
      como(db, { id }, `update public.novidades set situacao = 'aceita'`),
    ).rejects.toThrow()
    await expect(
      como(db, { id }, `insert into public.importacoes (tipo) values ('carga')`),
    ).rejects.toThrow()
  })

  it('admin ativo continua do PCM', async () => {
    const id = await criarPessoa(db, { papel: 'admin' })
    expect(await como(db, { id }, 'select public.eh_do_pcm() as v')).toEqual([{ v: true }])
  })

  it('anon lê 0 linhas de novidades e importações', async () => {
    await expect(como(db, 'anon', 'select * from public.novidades')).rejects.toThrow()
    await expect(como(db, 'anon', 'select * from public.importacoes')).rejects.toThrow()
  })

  it('só uma novidade aberta por regional, projeto e tipo', async () => {
    await expect(
      db.query(
        `insert into public.novidades (importacao_id, regional, projeto, tipo, dados, assinatura)
         values (1, 'SUL', 'EXEMPLO-0001', 'novo', '{"a":1}', 'outra')`,
      ),
    ).rejects.toThrow()
    await db.query(`update public.novidades set situacao = 'recusada'`)
    await db.query(
      `insert into public.novidades (importacao_id, regional, projeto, tipo, dados, assinatura)
       values (1, 'SUL', 'EXEMPLO-0001', 'novo', '{"a":1}', 'outra')`,
    )
  })

  it('rodar as migrações de novo não dá erro', async () => {
    await aplicarMigracoes(db)
  })
})
