import { describe, expect, it } from 'vitest'
import { colunaDaEtapa, corParado, diasParado, ETAPAS, etapaConcluida, type Etapa } from './etapas'

describe('etapas', () => {
  it('tem 12 etapas e não tem SGD CONFIRMADO', () => {
    expect(ETAPAS.length).toBe(12)
    expect(ETAPAS.includes('SGD CONFIRMADO' as Etapa)).toBe(false)
  })
  it('mapeia etapa para coluna do quadro', () => {
    expect(colunaDaEtapa('ANÁLISE PÓS-VISTORIA')).toBe('vistoria')
    expect(colunaDaEtapa('AGUARDANDO SGD')).toBe('sgd')
    expect(colunaDaEtapa('PROGRAMADA')).toBe('pronta')
    expect(colunaDaEtapa('PENDENTE DE RETORNO')).toBe('retorno')
    expect(colunaDaEtapa('NÃO EXECUTÁVEL')).toBe('concluidas')
  })
  it('toda etapa tem coluna', () => {
    for (const e of ETAPAS) expect(colunaDaEtapa(e)).toBeTruthy()
  })
  it('etapaConcluida só para as três finais', () => {
    expect(ETAPAS.filter(etapaConcluida)).toEqual(['EXECUTADA', 'TRANSFERIDA', 'NÃO EXECUTÁVEL'])
  })
})

describe('diasParado e corParado', () => {
  const p = { parado_amarelo: 7, parado_vermelho: 15 }
  it('conta dias pela data de Fortaleza', () => {
    expect(diasParado('2026-11-01T13:00:00Z', '2026-11-09')).toBe(8)
    // 02:00Z de 02/11 ainda é 01/11 em Fortaleza
    expect(diasParado('2026-11-02T02:00:00Z', '2026-11-09')).toBe(8)
  })
  it('classifica a cor', () => {
    expect(corParado(6, p)).toBe('normal')
    expect(corParado(8, p)).toBe('amarelo')
    expect(corParado(15, p)).toBe('vermelho')
  })
})
