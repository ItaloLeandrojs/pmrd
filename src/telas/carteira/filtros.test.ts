import { describe, expect, it } from 'vitest'
import type { ProjetoLinha } from '../../nuvem/carteira'
import { contarAtalhos, filtrarCarteira, type Atalho } from './filtros'

const HOJE = '2026-11-09'

function linha(p: Partial<ProjetoLinha> & { projeto: string }): ProjetoLinha {
  return {
    regional: 'SUL',
    origem: 'enel',
    municipio: 'Cidade Teste',
    prioridade: 5,
    pedido_gestor: false,
    pedido_gestor_em: null,
    pedido_gestor_por: null,
    qtd_defeitos: 1,
    alimentadores: [],
    etapa: 'EM ANÁLISE',
    etapa_desde: '2026-11-01T12:00:00+00:00',
    proxima_acao: null,
    prazo_proxima_acao: null,
    vistoria_data: null,
    responsavel: null,
    atualizado_em: '2026-11-01T12:00:00.000001+00:00',
    ...p,
  }
}

const base = (o: Partial<{ atalho: Atalho; busca: string; mostrarConcluidas: boolean }> = {}) => ({
  atalho: 'todas' as Atalho,
  busca: '',
  mostrarConcluidas: false,
  hoje: HOJE,
  ...o,
})

describe('filtrarCarteira', () => {
  it('atrasadas: prazo antes de hoje entra; prazo de hoje e concluída ficam fora', () => {
    const linhas = [
      linha({ projeto: 'EXEMPLO-001', prazo_proxima_acao: '2026-11-08' }),
      linha({ projeto: 'EXEMPLO-002', prazo_proxima_acao: '2026-11-09' }),
      linha({ projeto: 'EXEMPLO-003', etapa: 'EXECUTADA', prazo_proxima_acao: '2026-11-01' }),
    ]
    const r = filtrarCarteira(linhas, base({ atalho: 'atrasadas', mostrarConcluidas: true }))
    expect(r.map((l) => l.projeto)).toEqual(['EXEMPLO-001'])
  })

  it('esconde concluídas, a menos que "mostrar concluídas" esteja ligado', () => {
    const linhas = [
      linha({ projeto: 'EXEMPLO-001' }),
      linha({ projeto: 'EXEMPLO-002', etapa: 'EXECUTADA' }),
      linha({ projeto: 'EXEMPLO-003', etapa: 'TRANSFERIDA' }),
      linha({ projeto: 'EXEMPLO-004', etapa: 'NÃO EXECUTÁVEL' }),
    ]
    expect(filtrarCarteira(linhas, base()).map((l) => l.projeto)).toEqual(['EXEMPLO-001'])
    expect(filtrarCarteira(linhas, base({ mostrarConcluidas: true }))).toHaveLength(4)
  })

  it('cada atalho pega as etapas do fluxo', () => {
    const linhas = [
      linha({ projeto: 'EXEMPLO-001', etapa: 'SOLICITAR VISTORIA' }),
      linha({ projeto: 'EXEMPLO-002', etapa: 'AGUARDANDO VISTORIA' }),
      linha({ projeto: 'EXEMPLO-003', etapa: 'ANÁLISE PÓS-VISTORIA' }),
      linha({ projeto: 'EXEMPLO-004', etapa: 'PROGRAMAR EXECUÇÃO' }),
      linha({ projeto: 'EXEMPLO-005', etapa: 'SOLICITAR SGD' }),
      linha({ projeto: 'EXEMPLO-006', etapa: 'AGUARDANDO SGD' }),
      linha({ projeto: 'EXEMPLO-007', etapa: 'PROGRAMADA' }),
      linha({ projeto: 'EXEMPLO-008', etapa: 'PENDENTE DE RETORNO' }),
    ]
    const nomes = (a: Atalho) => filtrarCarteira(linhas, base({ atalho: a })).map((l) => l.projeto)
    expect(nomes('vistoria')).toEqual(['EXEMPLO-001', 'EXEMPLO-002', 'EXEMPLO-003'])
    expect(nomes('programar')).toEqual(['EXEMPLO-004'])
    expect(nomes('sgd')).toEqual(['EXEMPLO-005', 'EXEMPLO-006'])
    expect(nomes('programadas')).toEqual(['EXEMPLO-007'])
  })

  it('a busca ignora acento e caixa: "ico", "Icó" e "ICÓ" acham o mesmo município', () => {
    const linhas = [
      linha({ projeto: 'EXEMPLO-001', municipio: 'Icó' }),
      linha({ projeto: 'EXEMPLO-002', municipio: 'Crato' }),
    ]
    for (const termo of ['ico', 'Icó', 'ICÓ']) {
      expect(filtrarCarteira(linhas, base({ busca: termo })).map((l) => l.projeto)).toEqual(['EXEMPLO-001'])
    }
  })

  it('a busca acha pelo começo do número do projeto e pelo alimentador', () => {
    const linhas = [
      linha({ projeto: 'EXEMPLO-001', alimentadores: ['ALIM-A1'] }),
      linha({ projeto: 'OUTRO-777' }),
    ]
    expect(filtrarCarteira(linhas, base({ busca: 'exemplo' })).map((l) => l.projeto)).toEqual(['EXEMPLO-001'])
    expect(filtrarCarteira(linhas, base({ busca: 'alim-a' })).map((l) => l.projeto)).toEqual(['EXEMPLO-001'])
  })

  it('pedido do gestor vem antes, mesmo com prioridade 8; depois prioridade, prazo mais cedo e projeto', () => {
    const linhas = [
      linha({ projeto: 'EXEMPLO-010', prioridade: 1 }),
      linha({ projeto: 'EXEMPLO-011', prioridade: 8, pedido_gestor: true }),
      linha({ projeto: 'EXEMPLO-013', prioridade: 5, prazo_proxima_acao: '2026-12-01' }),
      linha({ projeto: 'EXEMPLO-012', prioridade: 5, prazo_proxima_acao: '2026-11-20' }),
      linha({ projeto: 'EXEMPLO-015', prioridade: 5, prazo_proxima_acao: null }),
      linha({ projeto: 'EXEMPLO-014', prioridade: 5, prazo_proxima_acao: null }),
      linha({ projeto: 'EXEMPLO-016', prioridade: null }),
    ]
    expect(filtrarCarteira(linhas, base()).map((l) => l.projeto)).toEqual([
      'EXEMPLO-011',
      'EXEMPLO-010',
      'EXEMPLO-012',
      'EXEMPLO-013',
      'EXEMPLO-014',
      'EXEMPLO-015',
      'EXEMPLO-016',
    ])
  })
})

describe('contarAtalhos', () => {
  it('bate com o tamanho de cada filtro', () => {
    const linhas = [
      linha({ projeto: 'EXEMPLO-001', etapa: 'AGUARDANDO VISTORIA', prazo_proxima_acao: '2026-11-01' }),
      linha({ projeto: 'EXEMPLO-002', etapa: 'PROGRAMAR EXECUÇÃO' }),
      linha({ projeto: 'EXEMPLO-003', etapa: 'AGUARDANDO SGD' }),
      linha({ projeto: 'EXEMPLO-004', etapa: 'PROGRAMADA', prazo_proxima_acao: '2026-11-05' }),
      linha({ projeto: 'EXEMPLO-005', etapa: 'EXECUTADA', prazo_proxima_acao: '2026-10-01' }),
    ]
    const c = contarAtalhos(linhas, HOJE)
    expect(c).toEqual({ todas: 4, vistoria: 1, programar: 1, sgd: 1, programadas: 1, atrasadas: 2 })
    for (const a of Object.keys(c) as Atalho[]) {
      expect(c[a]).toBe(filtrarCarteira(linhas, base({ atalho: a })).length)
    }
  })
})
