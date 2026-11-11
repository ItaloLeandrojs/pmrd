import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { aceitarEmLote, aceitarNovidade, infoDosProjetos, listarNovidades, recusarNovidade, ultimasImportacoes } from './novidades'

type Resposta = { data: unknown; error: unknown }

/** Cliente falso: grava cada passo do encadeamento e devolve as respostas por tabela (e por RPC) em ordem. */
function clienteFalso(respostas: Record<string, Resposta[]> = {}) {
  const chamadas: { tabela: string; op: string; args: unknown[] }[] = []
  const usadas: Record<string, number> = {}
  const proxima = (chave: string): Resposta => {
    const i = usadas[chave] ?? 0
    usadas[chave] = i + 1
    return respostas[chave]?.[i] ?? { data: [], error: null }
  }
  const construtor = (tabela: string, resposta: () => Resposta) => {
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'in', 'order', 'range', 'limit', 'abortSignal']) {
      b[op] = (...args: unknown[]) => { chamadas.push({ tabela, op, args }); return b }
    }
    b.then = (ok: (r: Resposta) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, ko)
    return b
  }
  const c = {
    from: (tabela: string) => construtor(tabela, () => proxima(tabela)),
    rpc: (nome: string, args: unknown) => {
      chamadas.push({ tabela: 'rpc', op: nome, args: [args] })
      return construtor('rpc', () => proxima(nome))
    },
  }
  return { c: c as unknown as SupabaseClient, chamadas }
}

describe('listarNovidades', () => {
  it('só as abertas da regional, em ordem de tipo e projeto', async () => {
    const linha = { id: 7, regional: 'SUL', projeto: 'EXEMPLO-0001', tipo: 'novo', dados: {}, criada_em: 'x' }
    const { c, chamadas } = clienteFalso({ novidades: [{ data: [linha], error: null }] })
    expect(await listarNovidades(c, 'SUL')).toEqual([linha])
    const ops = chamadas.filter((x) => x.tabela === 'novidades')
    expect(ops).toContainEqual({ tabela: 'novidades', op: 'eq', args: ['situacao', 'aberta'] })
    expect(ops).toContainEqual({ tabela: 'novidades', op: 'eq', args: ['regional', 'SUL'] })
    const ordem = ops.filter((x) => x.op === 'order').map((x) => x.args[0])
    expect(ordem.slice(0, 2)).toEqual(['tipo', 'projeto'])
  })

  it('"Todas" não filtra a regional', async () => {
    const { c, chamadas } = clienteFalso()
    await listarNovidades(c, 'TODAS')
    expect(chamadas.some((x) => x.op === 'eq' && x.args[0] === 'regional')).toBe(false)
  })

  it('erro do banco sobe', async () => {
    const { c } = clienteFalso({ novidades: [{ data: null, error: { message: 'falhou' } }] })
    await expect(listarNovidades(c, 'CS')).rejects.toEqual({ message: 'falhou' })
  })
})

describe('ultimasImportacoes', () => {
  it('a última demanda ou erro de cada regional (uma consulta por regional)', async () => {
    const cs = { regional: 'CS', tipo: 'demanda', quando: '2026-11-10T12:00:00Z', resumo: {}, erro: null }
    const sul = { regional: 'SUL', tipo: 'erro', quando: '2026-11-10T11:00:00Z', resumo: {}, erro: 'Planilha fora do padrão.' }
    const { c, chamadas } = clienteFalso({ importacoes: [{ data: [cs], error: null }, { data: [sul], error: null }, { data: [], error: null }] })
    expect(await ultimasImportacoes(c)).toEqual([cs, sul])
    const ops = chamadas.filter((x) => x.tabela === 'importacoes')
    expect(ops.filter((x) => x.op === 'eq' && x.args[0] === 'regional').map((x) => x.args[1])).toEqual(['CS', 'SUL', 'LESTE'])
    expect(ops).toContainEqual({ tabela: 'importacoes', op: 'in', args: ['tipo', ['demanda', 'erro']] })
    expect(ops).toContainEqual({ tabela: 'importacoes', op: 'order', args: ['quando', { ascending: false }] })
    expect(ops).toContainEqual({ tabela: 'importacoes', op: 'limit', args: [1] })
  })
})

describe('infoDosProjetos', () => {
  it('lê município, prioridade e etapa dos projetos pedidos', async () => {
    const p = { projeto: 'EXEMPLO-0001', municipio: 'Icó', prioridade: 4, etapa: 'AGUARDANDO SGD' }
    const { c, chamadas } = clienteFalso({ projetos: [{ data: [p], error: null }] })
    const info = await infoDosProjetos(c, ['EXEMPLO-0001'])
    expect(info.get('EXEMPLO-0001')).toEqual(p)
    expect(chamadas).toContainEqual({ tabela: 'projetos', op: 'in', args: ['projeto', ['EXEMPLO-0001']] })
  })

  it('lista vazia não consulta', async () => {
    const { c, chamadas } = clienteFalso()
    expect((await infoDosProjetos(c, [])).size).toBe(0)
    expect(chamadas).toHaveLength(0)
  })
})

describe('decisões', () => {
  it('aceitarNovidade sem escolha manda só { p_id }', async () => {
    const { c, chamadas } = clienteFalso({ aceitar_novidade: [{ data: null, error: null }] })
    await aceitarNovidade(c, 5)
    expect(chamadas).toContainEqual({ tabela: 'rpc', op: 'aceitar_novidade', args: [{ p_id: 5 }] })
  })

  it('aceitarNovidade com escolha manda p_escolha', async () => {
    const { c, chamadas } = clienteFalso({ aceitar_novidade: [{ data: null, error: null }] })
    await aceitarNovidade(c, 5, 'TRANSFERIDA')
    expect(chamadas).toContainEqual({ tabela: 'rpc', op: 'aceitar_novidade', args: [{ p_id: 5, p_escolha: 'TRANSFERIDA' }] })
  })

  it('erro do banco sobe como veio', async () => {
    const erro = { code: 'P0001', message: 'Esta novidade já foi decidida.' }
    const { c } = clienteFalso({ aceitar_novidade: [{ data: null, error: erro }] })
    await expect(aceitarNovidade(c, 5)).rejects.toEqual(erro)
  })

  it('aceitarEmLote manda os ids e devolve quantas', async () => {
    const { c, chamadas } = clienteFalso({ aceitar_novidades: [{ data: 2, error: null }] })
    expect(await aceitarEmLote(c, [3, 4])).toBe(2)
    expect(chamadas).toContainEqual({ tabela: 'rpc', op: 'aceitar_novidades', args: [{ p_ids: [3, 4] }] })
  })

  it('recusarNovidade manda { p_id }', async () => {
    const { c, chamadas } = clienteFalso({ recusar_novidade: [{ data: null, error: null }] })
    await recusarNovidade(c, 9)
    expect(chamadas).toContainEqual({ tabela: 'rpc', op: 'recusar_novidade', args: [{ p_id: 9 }] })
  })
})
