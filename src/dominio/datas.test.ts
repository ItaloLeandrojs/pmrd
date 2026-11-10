import { describe, expect, it } from 'vitest'
import { diasEntre, formatarBR, hojeEmFortaleza, semanaIso, somarDias } from './datas'

describe('semanaIso', () => {
  it('segunda a domingo da semana 46', () => {
    expect(semanaIso('2026-11-09')).toEqual({ ano: 2026, semana: 46, segunda: '2026-11-09', domingo: '2026-11-15' })
  })
  it('semana 41 e domingo', () => {
    expect(semanaIso('2026-10-05').semana).toBe(41)
    expect(semanaIso('2026-11-01').semana).toBe(44)
  })
  it('virada de ano', () => {
    expect(semanaIso('2026-01-01')).toEqual({ ano: 2026, semana: 1, segunda: '2025-12-29', domingo: '2026-01-04' })
    expect(semanaIso('2027-01-01')).toEqual({ ano: 2026, semana: 53, segunda: '2026-12-28', domingo: '2027-01-03' })
  })
})

describe('hojeEmFortaleza', () => {
  it('perto da meia-noite usa o dia de Fortaleza', () => {
    expect(hojeEmFortaleza(new Date('2026-11-10T02:30:00Z'))).toBe('2026-11-09')
    expect(hojeEmFortaleza(new Date('2026-11-10T03:00:00Z'))).toBe('2026-11-10')
  })
})

describe('somarDias, diasEntre, formatarBR', () => {
  it('somam e contam dias entre meses', () => {
    expect(somarDias('2026-11-30', 1)).toBe('2026-12-01')
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(diasEntre('2026-11-01', '2026-11-09')).toBe(8)
    expect(diasEntre('2026-11-09', '2026-11-01')).toBe(-8)
  })
  it('formata DD/MM/AAAA', () => {
    expect(formatarBR('2026-11-09')).toBe('09/11/2026')
  })
})
