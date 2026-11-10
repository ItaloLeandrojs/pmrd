import { describe, expect, it } from 'vitest'
import { normalizar } from './texto'

describe('normalizar', () => {
  it('tira acento, caixa e espaços sobrando', () => {
    expect(normalizar('  ICÓ ')).toBe('ico')
    expect(normalizar('Juazeiro  do Norte')).toBe('juazeiro do norte')
    expect(normalizar('Icó')).toBe(normalizar('ICÓ'))
  })
})
