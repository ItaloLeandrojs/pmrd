import { describe, expect, it } from 'vitest'
import { normalizarProjeto, validarNovoProjeto, type NovoProjeto } from './novoProjeto'

const base: NovoProjeto = {
  projeto: 'RESU-EXEMPLO-01', regional: 'SUL', municipio: 'Cidade Teste', prioridade: 5, ids_gom: ['G-1', 'G-2'],
}
const existentes = new Set(['RESU260001'])

describe('validarNovoProjeto', () => {
  it('projeto vazio ou só espaços', () => {
    expect(validarNovoProjeto({ ...base, projeto: '' }, existentes)).toBe('Falta o número do projeto.')
    expect(validarNovoProjeto({ ...base, projeto: '   ' }, existentes)).toBe('Falta o número do projeto.')
  })

  it('projeto que já está na carteira, mesmo com espaços ou minúsculas', () => {
    expect(validarNovoProjeto({ ...base, projeto: ' resu260001 ' }, existentes)).toBe('Este projeto já está na carteira.')
    expect(validarNovoProjeto({ ...base, projeto: 'RESU260001' }, existentes)).toBe('Este projeto já está na carteira.')
  })

  it('sem município', () => {
    expect(validarNovoProjeto({ ...base, municipio: '  ' }, existentes)).toBe('Falta o município.')
  })

  it('sem ID GOM exige a quantidade de defeitos', () => {
    const sem = { ...base, ids_gom: undefined }
    expect(validarNovoProjeto(sem, existentes)).toBe('Informe os ID GOM ou a quantidade de defeitos.')
    expect(validarNovoProjeto({ ...sem, ids_gom: [' ', ''] }, existentes)).toBe('Informe os ID GOM ou a quantidade de defeitos.')
    expect(validarNovoProjeto({ ...sem, qtd_defeitos: 0 }, existentes)).toBe('Informe os ID GOM ou a quantidade de defeitos.')
    expect(validarNovoProjeto({ ...sem, qtd_defeitos: 22 }, existentes)).toBeNull()
  })

  it('ID GOM repetido na própria lista é erro', () => {
    expect(validarNovoProjeto({ ...base, ids_gom: ['G-1', ' g-1 '] }, existentes)).toBe('ID GOM repetido na lista: G-1.')
  })

  it('tudo certo: null', () => {
    expect(validarNovoProjeto(base, existentes)).toBeNull()
  })

  it('o projeto é gravado sem espaços e em maiúsculas', () => {
    expect(normalizarProjeto(' resu 26 0002 ')).toBe('RESU260002')
  })
})
