import { describe, expect, it } from 'vitest'
import { baseDoLid, BASES, grupoSugerido, TIPOS_EQUIPE } from './equipes'

describe('equipes', () => {
  it('tem as 10 bases (SNP e TAA desde 11/11; RSL, ART e JGB do Leste na Tarefa 7c)', () => {
    expect(Object.keys(BASES)).toEqual(['JZN', 'MLG', 'ICO', 'IGT', 'CPS', 'SNP', 'TAA', 'RSL', 'ART', 'JGB'])
    expect(BASES.SNP).toBe('Senador Pompeu')
    expect(BASES.TAA).toBe('Tauá')
    expect(BASES.RSL).toBe('Limoeiro')
    expect(BASES.ART).toBe('Aracati')
    expect(BASES.JGB).toBe('Jaguaribe')
  })
  it('tem os 14 tipos de equipe, e os 10 novos não têm grupo sugerido', () => {
    expect(TIPOS_EQUIPE).toEqual(['ML', 'LVR', 'MP', 'LV', 'RD', 'LB', 'LN', 'MM', 'SK', 'GA', 'TR', 'RL', 'LM', 'MO'])
    for (const tipo of TIPOS_EQUIPE.slice(4)) expect(grupoSugerido(tipo, 'JZN')).toBeNull()
    expect(grupoSugerido('ML', 'RSL')).toBe('ML Limoeiro')
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
