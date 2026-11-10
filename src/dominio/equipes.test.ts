import { describe, expect, it } from 'vitest'
import { baseDoLid, BASES, grupoSugerido } from './equipes'

describe('equipes', () => {
  it('tem as 5 bases', () => {
    expect(Object.keys(BASES)).toEqual(['JZN', 'MLG', 'ICO', 'IGT', 'CPS'])
  })
  it('baseDoLid pega o prefixo conhecido', () => {
    expect(baseDoLid('JZN-ML-99X')).toBe('JZN')
    expect(baseDoLid('XYZ-ML-01')).toBeNull()
    expect(baseDoLid('toString-1')).toBeNull()
  })
  it('grupoSugerido', () => {
    expect(grupoSugerido('MP', null)).toBe('Manutenção Pesada')
    expect(grupoSugerido('LVR', 'JZN')).toBe('Linha Viva')
    expect(grupoSugerido('LV', null)).toBe('Linha Viva')
    expect(grupoSugerido('ML', 'MLG')).toBe('ML Milagres')
    expect(grupoSugerido('ML', null)).toBeNull()
  })
})
