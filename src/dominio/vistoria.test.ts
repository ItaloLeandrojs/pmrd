import { describe, expect, it } from 'vitest'
import { situacaoVistoria } from './vistoria'

const p = { validade_vistoria: 45, alerta_vencimento: 7 }

describe('situacaoVistoria', () => {
  it('vencendo', () => {
    expect(situacaoVistoria('2026-10-01', '2026-11-09', p)).toEqual({ situacao: 'vencendo', validade: '2026-11-15', diasRestantes: 6 })
    expect(situacaoVistoria('2026-10-01', '2026-11-15', p)).toMatchObject({ situacao: 'vencendo', diasRestantes: 0 })
  })
  it('válida', () => {
    expect(situacaoVistoria('2026-10-01', '2026-11-07', p)).toMatchObject({ situacao: 'válida', diasRestantes: 8 })
  })
  it('vencida', () => {
    expect(situacaoVistoria('2026-10-01', '2026-11-16', p)).toMatchObject({ situacao: 'vencida', diasRestantes: -1 })
  })
  it('sem vistoria', () => {
    expect(situacaoVistoria(null, '2026-11-09', p)).toEqual({ situacao: 'sem vistoria', validade: null, diasRestantes: null })
  })
})
