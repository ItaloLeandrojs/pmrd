import { describe, expect, it } from 'vitest'
import { TELAS, lerRota, regionalEfetiva, telasVisiveis } from './rotas'

const tela = (id: string) => TELAS.find((t) => t.id === id)!

describe('rotas', () => {
  it('a ordem das telas segue a spec 7', () => {
    expect(TELAS.map((t) => t.id)).toEqual([
      'hoje', 'agenda', 'carteira', 'mapa', 'sgd', 'retorno', 'reports', 'indicadores',
      'novidades', 'saga', 'configuracoes',
    ])
  })

  it('equipe não vê Configurações e vê as outras 10', () => {
    const ids = telasVisiveis('equipe').map((t) => t.id)
    expect(ids).not.toContain('configuracoes')
    expect(ids).toHaveLength(10)
  })

  it('admin vê as 11', () => {
    expect(telasVisiveis('admin')).toHaveLength(11)
  })

  it('Agenda não aceita Todas: usa a última regional única', () => {
    expect(regionalEfetiva(tela('agenda'), 'TODAS', 'SUL')).toBe('SUL')
    expect(regionalEfetiva(tela('agenda'), 'LESTE', 'SUL')).toBe('LESTE')
  })

  it('Carteira aceita Todas', () => {
    expect(regionalEfetiva(tela('carteira'), 'TODAS', 'SUL')).toBe('TODAS')
  })

  it('lerRota entende o hash e cai em hoje', () => {
    expect(lerRota('#/carteira')).toBe('carteira')
    expect(lerRota('#/xyz')).toBe('hoje')
    expect(lerRota('')).toBe('hoje')
  })
})
