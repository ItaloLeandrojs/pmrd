import { describe, expect, it } from 'vitest'
import { baseDoLid, BASES, grupoSugerido } from './equipes'

describe('equipes', () => {
  it('tem as 7 bases (SNP e TAA desde 11/11)', () => {
    expect(Object.keys(BASES)).toEqual(['JZN', 'MLG', 'ICO', 'IGT', 'CPS', 'SNP', 'TAA'])
    expect(BASES.SNP).toBe('Senador Pompeu')
    expect(BASES.TAA).toBe('Tauá')
  })
  it('SNP e TAA dão base e grupo', () => {
    expect(baseDoLid('SNP-COS-99X')).toBe('SNP')
    expect(baseDoLid('TAA-ML-99X')).toBe('TAA')
    expect(grupoSugerido('ML', 'SNP')).toBe('ML Senador Pompeu')
    expect(grupoSugerido('ML', 'TAA')).toBe('ML Tauá')
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
