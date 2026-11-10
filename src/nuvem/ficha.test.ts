import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { carregarFicha, criarProjetoManual } from './carteira'
import type { NovoProjeto } from '../telas/carteira/novoProjeto'

type Resposta = { data?: unknown; error: unknown } | Error
interface Chamada { tabela: string; op: string; args: unknown[] }

/** Cliente falso: respostas por "tabela.operação" (select, insert); registra o encadeamento. */
function clienteFalso(respostas: Record<string, Resposta>) {
  const chamadas: Chamada[] = []
  const c = {
    from(tabela: string) {
      let modo = 'select'
      let unico = false
      const b: Record<string, unknown> = {}
      const reg = (op: string) => (...args: unknown[]) => { chamadas.push({ tabela, op, args }); return b }
      for (const op of ['select', 'eq', 'order', 'limit', 'abortSignal']) b[op] = reg(op)
      b.insert = (...args: unknown[]) => { modo = 'insert'; chamadas.push({ tabela, op: 'insert', args }); return b }
      b.maybeSingle = () => { unico = true; return b }
      b.then = (ok: (r: unknown) => unknown, falha: (e: unknown) => unknown) => {
        const r = respostas[`${tabela}.${modo}${unico ? '.unico' : ''}`] ?? { data: [], error: null }
        return (r instanceof Error ? Promise.reject(r) : Promise.resolve(r)).then(ok, falha)
      }
      return b
    },
  }
  return { c: c as unknown as SupabaseClient, chamadas }
}

const EM = '2026-11-09T15:30:12.123456+00:00'
const bruto = {
  projeto: 'EXEMPLO-001', regional: 'SUL', origem: 'enel', municipio: 'Cidade Teste', prioridade: 3, pedido_gestor: true,
  pedido_gestor_em: '2026-11-05', pedido_gestor_por: 'Gestor Teste',
  alimentadores: ['AL-1'], etapa: 'EM ANÁLISE', etapa_desde: EM, proxima_acao: null, prazo_proxima_acao: null,
  vistoria_data: null, responsavel: null, atualizado_em: EM, qtd_defeitos_informada: null,
  defeitos: [{ situacao: 'pendente' }, { situacao: 'removido' }],
  ot_correcao: 'OT-EXEMPLO', endereco: 'Rua Exemplo', elemento_corte: 'CF EXEMPLO', qtd_clientes: 10, estruturas: ['E1'],
  intervencao_prevista: 'DESL MT', vistoria_situacao: null, vistoria_recurso: null, vistoria_intervencao: null,
  vistoria_observacao: null, vistoria_enviada_em: null, saiu_da_demanda: false,
}

describe('carregarFicha', () => {
  it('junta projeto, defeitos e histórico do projeto, mais recente primeiro', async () => {
    const { c, chamadas } = clienteFalso({
      'projetos.select.unico': { data: bruto, error: null },
      'defeitos.select': { data: [{ id_gom: 'G-1', prioridade: 3, estrutura: 'E1', alimentador: 'AL-1', situacao: 'pendente' }], error: null },
      'historico.select': { data: [{ quando: EM, quem: 'u1', antes: { etapa: 'A' }, depois: { etapa: 'B' } }], error: null },
    })
    const f = await carregarFicha(c, 'EXEMPLO-001')
    expect(f.projeto).toMatchObject({ projeto: 'EXEMPLO-001', qtd_defeitos: 1, pedido_gestor_por: 'Gestor Teste', ot_correcao: 'OT-EXEMPLO' })
    expect(f.defeitos).toEqual([{ id_gom: 'G-1', prioridade: 3, estrutura: 'E1', alimentador: 'AL-1', situacao: 'pendente' }])
    expect(f.historico).toEqual([{ quando: EM, quem: 'u1', antes: { etapa: 'A' }, depois: { etapa: 'B' } }])
    expect(chamadas).toContainEqual({ tabela: 'historico', op: 'eq', args: ['tabela', 'projetos'] })
    expect(chamadas).toContainEqual({ tabela: 'historico', op: 'eq', args: ['chave', 'EXEMPLO-001'] })
    expect(chamadas).toContainEqual({ tabela: 'historico', op: 'order', args: ['quando', { ascending: false }] })
    expect(chamadas).toContainEqual({ tabela: 'defeitos', op: 'eq', args: ['projeto', 'EXEMPLO-001'] })
    expect(chamadas.filter((x) => x.op === 'abortSignal')).toHaveLength(3)
  })

  it('projeto que não existe (ou sem permissão): erro em português', async () => {
    const { c } = clienteFalso({ 'projetos.select.unico': { data: null, error: null } })
    await expect(carregarFicha(c, 'EXEMPLO-404')).rejects.toThrow('Projeto não encontrado.')
  })

  it('histórico sem antes (inclusão) vira antes vazio', async () => {
    const { c } = clienteFalso({
      'projetos.select.unico': { data: bruto, error: null },
      'historico.select': { data: [{ quando: EM, quem: null, antes: null, depois: { projeto: 'EXEMPLO-001' } }], error: null },
    })
    const f = await carregarFicha(c, 'EXEMPLO-001')
    expect(f.historico[0]).toMatchObject({ quem: '', antes: {} })
  })
})

const novo: NovoProjeto = {
  projeto: ' resu-exemplo 01 ', regional: 'SUL', municipio: 'Cidade Teste', prioridade: 4,
  ot_correcao: 'OT-EXEMPLO', ids_gom: ['G-1', ' G-2 '],
}

describe('criarProjetoManual', () => {
  it('grava o projeto (manual, EM ANÁLISE, sem espaços e em maiúsculas) e depois os defeitos pendentes', async () => {
    const { c, chamadas } = clienteFalso({ 'projetos.insert': { error: null }, 'defeitos.insert': { error: null } })
    const r = await criarProjetoManual(c, novo)
    expect(r).toEqual({ ok: true })
    const ins = chamadas.filter((x) => x.op === 'insert')
    expect(ins.map((x) => x.tabela)).toEqual(['projetos', 'defeitos'])
    expect(ins[0].args[0]).toMatchObject({
      projeto: 'RESU-EXEMPLO01', regional: 'SUL', origem: 'manual', etapa: 'EM ANÁLISE', municipio: 'Cidade Teste',
      prioridade: 4, ot_correcao: 'OT-EXEMPLO', qtd_defeitos_informada: 2,
    })
    expect(ins[1].args[0]).toEqual([
      { id_gom: 'G-1', projeto: 'RESU-EXEMPLO01', prioridade: 4, situacao: 'pendente' },
      { id_gom: 'G-2', projeto: 'RESU-EXEMPLO01', prioridade: 4, situacao: 'pendente' },
    ])
  })

  it('sem ID GOM: grava a quantidade informada e nenhum defeito', async () => {
    const { c, chamadas } = clienteFalso({ 'projetos.insert': { error: null } })
    const r = await criarProjetoManual(c, { ...novo, ids_gom: undefined, qtd_defeitos: 22 })
    expect(r).toEqual({ ok: true })
    expect(chamadas.filter((x) => x.op === 'insert')).toHaveLength(1)
    expect(chamadas.find((x) => x.op === 'insert')!.args[0]).toMatchObject({ qtd_defeitos_informada: 22 })
  })

  it('projeto repetido (23505): "Este projeto já está na carteira."', async () => {
    const { c, chamadas } = clienteFalso({ 'projetos.insert': { error: { code: '23505', message: 'duplicate key' } } })
    const r = await criarProjetoManual(c, novo)
    expect(r).toEqual({ ok: false, erro: 'Este projeto já está na carteira.' })
    expect(chamadas.filter((x) => x.op === 'insert')).toHaveLength(1)
  })

  it('defeitos falham: devolve erro dizendo que o projeto entrou sem os ID GOM e por quê', async () => {
    const { c } = clienteFalso({
      'projetos.insert': { error: null },
      'defeitos.insert': { error: { code: '23505', message: 'duplicate key value violates unique constraint "defeitos_pkey"' } },
    })
    const r = await criarProjetoManual(c, novo)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erro).toMatch(/^O projeto entrou, mas sem os ID GOM: /)
    expect(!r.ok && r.erro).toMatch(/já existe/)
  })

  it('falha parcial: o projeto já foi gravado com a quantidade de defeitos igual ao número de ID GOM, e o erro diz isso', async () => {
    const { c, chamadas } = clienteFalso({
      'projetos.insert': { error: null },
      'defeitos.insert': { error: { code: '42501', message: 'permission denied' } },
    })
    const r = await criarProjetoManual(c, { ...novo, ids_gom: ['G-1', 'G-2', 'G-3'] })
    expect(chamadas.find((x) => x.tabela === 'projetos' && x.op === 'insert')!.args[0]).toMatchObject({ qtd_defeitos_informada: 3 })
    expect(r).toEqual({
      ok: false, projetoCriado: true, erro: 'O projeto entrou, mas sem os ID GOM: sem permissão para gravar defeitos.',
    })
  })

  it('sem rede ao gravar o projeto e ele não está no banco: mensagem de conexão, sem lançar', async () => {
    const { c } = clienteFalso({
      'projetos.insert': new TypeError('Failed to fetch'),
      'projetos.select.unico': { data: null, error: null },
    })
    const r = await criarProjetoManual(c, novo)
    expect(r).toEqual({ ok: false, erro: 'Não salvou: sem conexão. Confira a internet ou a VPN.' })
  })

  it('tempo limite mas o projeto entrou: confere no banco, segue para os defeitos e dá certo', async () => {
    const tempo = Object.assign(new Error('signal timed out'), { name: 'TimeoutError' })
    const { c, chamadas } = clienteFalso({
      'projetos.insert': tempo,
      'projetos.select.unico': { data: { projeto: 'RESU-EXEMPLO01' }, error: null },
      'defeitos.insert': { error: null },
    })
    const r = await criarProjetoManual(c, novo)
    expect(r).toEqual({ ok: true })
    expect(chamadas.filter((x) => x.op === 'insert').map((x) => x.tabela)).toEqual(['projetos', 'defeitos'])
  })

  it('tempo limite e nem a conferência responde: diz que não dá para saber e pede para procurar antes de repetir', async () => {
    const tempo = Object.assign(new Error('signal timed out'), { name: 'TimeoutError' })
    const { c } = clienteFalso({ 'projetos.insert': tempo, 'projetos.select.unico': tempo })
    const r = await criarProjetoManual(c, novo)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erro).toMatch(/não dá para saber se o projeto entrou/)
  })

  it('sem rede ao gravar os defeitos: projeto entrou sem os ID GOM, com o motivo', async () => {
    const { c } = clienteFalso({ 'projetos.insert': { error: null }, 'defeitos.insert': new TypeError('Failed to fetch') })
    const r = await criarProjetoManual(c, novo)
    expect(!r.ok && r.erro).toMatch(/^O projeto entrou, mas sem os ID GOM: sem conexão/)
  })
})
