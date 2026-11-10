import { describe, expect, it } from 'vitest'
// @ts-expect-error: módulo .mjs sem tipos
import { ajudaContaDeTeste, etapaDeTroca, lerEnv, negado, nomesQueFaltam, statusDoErro } from '../../scripts/conferir-ajudas.mjs'
import { ETAPAS } from '../../src/dominio/etapas'

describe('ajudas do conferir-supabase', () => {
  it('lê CHAVE=valor, com aspas, espaços, BOM e linhas de comentário', () => {
    const v = lerEnv('\uFEFF# nota\r\nEMAIL_TESTE = "a@exemplo.test"\r\nSENHA_TESTE=xyz\r\n')
    expect(v).toEqual({ EMAIL_TESTE: 'a@exemplo.test', SENHA_TESTE: 'xyz' })
  })

  it('lista os nomes sem valor', () => {
    expect(nomesQueFaltam({ A: '1', B: '' }, ['A', 'B', 'C'])).toEqual(['B', 'C'])
  })

  it('negado só aceita permissão negada (42501) ou nenhuma linha', () => {
    expect(negado({ error: { code: '42501', message: 'permission denied' }, data: null })).toBe(true)
    expect(negado({ error: null, data: [] })).toBe(true)
    expect(negado({ error: null, data: [{ id: 1 }] })).toBe(false)
  })

  it('qualquer outro erro (rede, chave errada, tabela inexistente) NÃO conta como negado', () => {
    expect(negado({ error: { message: 'x' }, data: null })).toBe(false)
    expect(negado({ error: { code: '42P01', message: 'relation does not exist' }, data: null })).toBe(false)
    expect(negado({ error: { code: 'PGRST301', message: 'JWT invalid' }, data: null })).toBe(false)
    expect(negado({ error: { message: 'TypeError: fetch failed' }, data: null })).toBe(false)
  })

  it('a etapa de troca é válida e diferente da atual', () => {
    for (const atual of ETAPAS) {
      const nova = etapaDeTroca(atual)
      expect(nova).not.toBe(atual)
      expect(ETAPAS).toContain(nova)
    }
  })

  it('acha o status HTTP no erro da função', () => {
    expect(statusDoErro({ context: { status: 403 } })).toBe(403)
    expect(statusDoErro(null)).toBeNull()
    expect(statusDoErro({ name: 'FunctionsFetchError' })).toBeNull()
  })

  it('a ajuda diz em português como criar o arquivo e não traz valores', () => {
    const t = ajudaContaDeTeste('C:\\x\\pmrd-teste.env')
    expect(t).toMatch(/pmrd-teste\.env/)
    expect(t).toMatch(/EMAIL_TESTE=/)
    expect(t).not.toMatch(/—/)
  })
})
