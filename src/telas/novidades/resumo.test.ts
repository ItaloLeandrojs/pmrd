import { describe, expect, it } from 'vitest'
import type { Novidade, UltimaImportacao } from '../../nuvem/novidades'
import { formatarDiaHora, resumoDaNovidade, textoImportacao, textoPrioridade } from './resumo'

function nov(tipo: Novidade['tipo'], dados: unknown): Novidade {
  return { id: 1, regional: 'SUL', projeto: 'EXEMPLO-0001', tipo, dados, criada_em: '2026-11-10T12:00:00+00:00' }
}

const defeito = (id_gom: string, prioridade: number | null) => ({
  id_gom, prioridade, estrutura: 'EXEMPLO-EST-1', alimentador: 'EXEMPLO-AL-01', estado_enel: 'PENDENTE', lat: null, lng: null,
})

describe('resumoDaNovidade', () => {
  it('novo: quantos defeitos e a prioridade do projeto (a menor), com o nome da ordem', () => {
    const n = nov('novo', {
      projeto: 'EXEMPLO-0001', municipio: 'Fortaleza', alimentadores: ['EXEMPLO-AL-01'],
      defeitos: [defeito('EXEMPLO-D1', 9), defeito('EXEMPLO-D2', 7), defeito('EXEMPLO-D3', null)],
    })
    expect(resumoDaNovidade(n)).toBe('3 defeitos, prioridade 7 (Conj. crítico)')
  })

  it('novo: um defeito só e sem prioridade', () => {
    const n = nov('novo', { projeto: 'EXEMPLO-0001', municipio: null, alimentadores: [], defeitos: [defeito('EXEMPLO-D1', null)] })
    expect(resumoDaNovidade(n)).toBe('1 defeito, sem prioridade')
  })

  it('mudou: defeitos que entram e saem e a prioridade de antes para a nova', () => {
    const n = nov('mudou', {
      entram: [defeito('EXEMPLO-D9', 3)], saem: ['EXEMPLO-D1', 'EXEMPLO-D2'],
      prioridade_antes: 9, prioridade_nova: 3, alimentadores: ['EXEMPLO-AL-01'],
    })
    expect(resumoDaNovidade(n)).toBe('+1 defeito, -2 defeitos, prioridade 9 para 3')
  })

  it('mudou: prioridade nula não entra no texto', () => {
    const n = nov('mudou', { entram: [], saem: ['EXEMPLO-D1'], prioridade_antes: 4, prioridade_nova: null, alimentadores: [] })
    expect(resumoDaNovidade(n)).toBe('-1 defeito')
  })

  it('saiu: a etapa em que o projeto está', () => {
    expect(resumoDaNovidade(nov('saiu', { etapa: 'AGUARDANDO SGD' }))).toBe(
      'Não está mais na demanda da Enel (etapa: AGUARDANDO SGD)',
    )
  })

  it('corrigido: quantos defeitos fecharam e o estado na Enel', () => {
    const n = nov('corrigido', { defeitos: [{ id_gom: 'EXEMPLO-D1', estado_enel: 'CORRIGIDO' }, { id_gom: 'EXEMPLO-D2', estado_enel: 'CORRIGIDO' }] })
    expect(resumoDaNovidade(n)).toBe('2 defeitos fechados na Enel: CORRIGIDO')
  })

  it('corrigido: estados diferentes aparecem com a quantidade de cada um', () => {
    const n = nov('corrigido', {
      defeitos: [
        { id_gom: 'EXEMPLO-D1', estado_enel: 'CORRIGIDO' },
        { id_gom: 'EXEMPLO-D2', estado_enel: 'EXECUTADA' },
        { id_gom: 'EXEMPLO-D3', estado_enel: 'CORRIGIDO' },
      ],
    })
    expect(resumoDaNovidade(n)).toBe('3 defeitos fechados na Enel: CORRIGIDO (2), EXECUTADA (1)')
  })
})

describe('textoPrioridade', () => {
  it('nome da ordem 6.3 ou "sem prioridade"', () => {
    expect(textoPrioridade(1)).toBe('prioridade 1 (Justiça)')
    expect(textoPrioridade(11)).toBe('prioridade 11 (Demanda extra)')
    expect(textoPrioridade(null)).toBe('sem prioridade')
  })
})

describe('formatarDiaHora', () => {
  it('DD/MM HH:MM no fuso de Fortaleza (UTC-3)', () => {
    expect(formatarDiaHora('2026-11-10T02:05:00+00:00')).toBe('09/11 23:05')
    expect(formatarDiaHora('2026-01-05T15:30:00Z')).toBe('05/01 12:30')
  })
})

describe('textoImportacao', () => {
  // 12:00 em Fortaleza
  const AGORA = new Date('2026-11-10T15:00:00Z')
  const imp = (quando: string, extra: Partial<UltimaImportacao> = {}): UltimaImportacao => ({
    regional: 'SUL', tipo: 'demanda', quando, resumo: {}, erro: null, ...extra,
  })

  it('lida hoje', () => {
    expect(textoImportacao('SUL', imp('2026-11-10T12:00:00Z'), AGORA)).toEqual({ nivel: 'ok', texto: 'Sul: lida hoje às 09:00' })
  })

  it('lida ontem, ainda dentro das 26 horas', () => {
    expect(textoImportacao('LESTE', imp('2026-11-09T14:00:00Z'), AGORA)).toEqual({ nivel: 'ok', texto: 'Leste: lida ontem às 11:00' })
  })

  it('mais de 26 horas: sem importação desde DD/MM HH:MM', () => {
    expect(textoImportacao('CS', imp('2026-11-09T12:00:00Z'), AGORA)).toEqual({ nivel: 'velha', texto: 'CS: sem importação desde 09/11 09:00' })
  })

  it('erro: o texto do erro vem junto', () => {
    const r = textoImportacao('SUL', imp('2026-11-10T12:00:00Z', { tipo: 'erro', erro: 'Aba DEMANDA MENSAL sem a coluna PROJETO.' }), AGORA)
    expect(r).toEqual({ nivel: 'erro', texto: 'Sul: a leitura de hoje às 09:00 deu erro', detalhe: 'Aba DEMANDA MENSAL sem a coluna PROJETO.' })
  })

  it('nenhuma importação ainda', () => {
    expect(textoImportacao('SUL', undefined, AGORA)).toEqual({ nivel: 'nenhuma', texto: 'Sul: nenhuma importação ainda' })
  })
})
