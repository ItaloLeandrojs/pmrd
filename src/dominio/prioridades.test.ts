import { describe, expect, it } from 'vitest'
import { chaveDeOrdem, PRIORIDADES, prioridadeDoProjeto } from './prioridades'

describe('prioridades', () => {
  it('a do projeto é a mais alta (menor número)', () => {
    expect(prioridadeDoProjeto([9, 3, 11])).toBe(3)
    expect(prioridadeDoProjeto([])).toBeNull()
  })
  it('pedido do gestor passa na frente; sem prioridade vai por último', () => {
    expect(chaveDeOrdem({ pedido_gestor: true, prioridade: 8 })).toBe(0)
    expect(chaveDeOrdem({ pedido_gestor: false, prioridade: null })).toBe(99)
    expect(chaveDeOrdem({ pedido_gestor: false, prioridade: 1 })).toBe(1)
  })
  it('tem as 11 prioridades', () => {
    expect(Object.keys(PRIORIDADES).length).toBe(11)
    expect(PRIORIDADES[7]).toBe('Conj. crítico')
  })
})
