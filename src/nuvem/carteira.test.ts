import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { atualizarProjeto, listarProjetos } from './carteira'

type Resposta = { data: unknown; error: unknown }

/** Cliente falso: imita o encadeamento do supabase-js e devolve respostas combinadas por operação. */
function clienteFalso(respostas: { update?: Resposta | Error; leitura?: Resposta; lista?: Resposta[] }) {
  const chamadas: { op: string; args: unknown[] }[] = []
  let pagina = 0
  const c = {
    from(tabela: string) {
      chamadas.push({ op: 'from', args: [tabela] })
      let modo: 'lista' | 'update' = 'lista'
      let leituraUnica = false
      const b: Record<string, unknown> = {
        select: (...a: unknown[]) => { chamadas.push({ op: 'select', args: a }); return b },
        update: (...a: unknown[]) => { modo = 'update'; chamadas.push({ op: 'update', args: a }); return b },
        eq: (...a: unknown[]) => { chamadas.push({ op: 'eq', args: a }); return b },
        abortSignal: (...a: unknown[]) => { chamadas.push({ op: 'abortSignal', args: a }); return b },
        order: (...a: unknown[]) => { chamadas.push({ op: 'order', args: a }); return b },
        range: (...a: unknown[]) => { chamadas.push({ op: 'range', args: a }); return b },
        maybeSingle: () => { leituraUnica = true; return b },
        then: (ok: (r: Resposta) => unknown, falha: (e: unknown) => unknown) => {
          let r: Resposta | Error | undefined
          if (leituraUnica) r = respostas.leitura
          else if (modo === 'update') r = respostas.update
          else r = respostas.lista?.[pagina++]
          return (r instanceof Error ? Promise.reject(r) : Promise.resolve(r as Resposta)).then(ok, falha)
        },
      }
      return b
    },
  }
  return { c: c as unknown as SupabaseClient, chamadas }
}

function bruta(p: string, em: string, extra: Record<string, unknown> = {}) {
  return {
    projeto: p, regional: 'SUL', origem: 'enel', municipio: null, prioridade: 3, pedido_gestor: false,
    alimentadores: ['AL-1'], etapa: 'EM ANÁLISE', etapa_desde: '2026-11-01T12:00:00+00:00', proxima_acao: null,
    prazo_proxima_acao: null, vistoria_data: null, responsavel: null, atualizado_em: em,
    qtd_defeitos_informada: null, defeitos: [], ...extra,
  }
}

const EM1 = '2026-11-09T15:30:12.123456+00:00'
const EM2 = '2026-11-09T15:31:00.654321+00:00'

describe('atualizarProjeto', () => {
  it('manda update com eq no projeto e no atualizado_em exatamente como veio (sem passar por Date)', async () => {
    const { c, chamadas } = clienteFalso({ update: { data: [bruta('EXEMPLO-001', EM2, { etapa: 'PROGRAMADA' })], error: null } })
    const r = await atualizarProjeto(c, 'EXEMPLO-001', EM1, { etapa: 'PROGRAMADA' })
    expect(chamadas).toContainEqual({ op: 'update', args: [{ etapa: 'PROGRAMADA' }] })
    expect(chamadas).toContainEqual({ op: 'eq', args: ['projeto', 'EXEMPLO-001'] })
    expect(chamadas).toContainEqual({ op: 'eq', args: ['atualizado_em', EM1] })
    expect(r.ok && r.linha).toMatchObject({ etapa: 'PROGRAMADA', atualizado_em: EM2 })
  })

  it('0 linhas e a linha mudou: conflito, com a linha atual', async () => {
    const { c } = clienteFalso({
      update: { data: [], error: null },
      leitura: { data: bruta('EXEMPLO-001', EM2, { etapa: 'SOLICITAR SGD' }), error: null },
    })
    const r = await atualizarProjeto(c, 'EXEMPLO-001', EM1, { etapa: 'PROGRAMADA' })
    expect(r).toMatchObject({
      ok: false, motivo: 'conflito', mensagem: 'Outra pessoa mudou este projeto. Recarreguei a linha.',
      atual: { etapa: 'SOLICITAR SGD', atualizado_em: EM2 },
    })
  })

  it('0 linhas e a linha não mudou: sem permissão (o banco barrou)', async () => {
    const { c } = clienteFalso({
      update: { data: [], error: null },
      leitura: { data: bruta('EXEMPLO-001', EM1), error: null },
    })
    const r = await atualizarProjeto(c, 'EXEMPLO-001', EM1, { etapa: 'PROGRAMADA' })
    expect(r).toEqual({ ok: false, motivo: 'sem-permissao', mensagem: 'Sem permissão para mudar este projeto.' })
  })

  it('erro de rede (TypeError Failed to fetch): motivo rede com a mensagem combinada', async () => {
    const { c } = clienteFalso({ update: new TypeError('Failed to fetch') })
    const r = await atualizarProjeto(c, 'EXEMPLO-001', EM1, { etapa: 'PROGRAMADA' })
    expect(r).toEqual({ ok: false, motivo: 'rede', mensagem: 'Não salvou: sem conexão. A mudança foi desfeita.' })
  })

  it('erro de rede devolvido no campo error (FetchError) também é rede', async () => {
    const { c } = clienteFalso({ update: { data: null, error: { name: 'FetchError', message: 'TypeError: Failed to fetch' } } })
    const r = await atualizarProjeto(c, 'EXEMPLO-001', EM1, { etapa: 'PROGRAMADA' })
    expect(r).toMatchObject({ ok: false, motivo: 'rede' })
  })

  it('outro erro do banco não vira mudança silenciosa: é lançado', async () => {
    const { c } = clienteFalso({ update: { data: null, error: { message: 'violates check constraint' } } })
    await expect(atualizarProjeto(c, 'EXEMPLO-001', EM1, { etapa: 'PROGRAMADA' })).rejects.toMatchObject({
      message: 'violates check constraint',
    })
  })
})

describe('atualizarProjeto: tempo limite', () => {
  it('o update e a releitura levam um sinal de cancelamento (AbortSignal)', async () => {
    const { c, chamadas } = clienteFalso({
      update: { data: [], error: null },
      leitura: { data: bruta('EXEMPLO-001', EM1), error: null },
    })
    await atualizarProjeto(c, 'EXEMPLO-001', EM1, { etapa: 'PROGRAMADA' })
    const sinais = chamadas.filter((x) => x.op === 'abortSignal')
    expect(sinais).toHaveLength(2)
    for (const s of sinais) expect(s.args[0]).toBeInstanceOf(AbortSignal)
  })

  it('estouro do tempo (TimeoutError) vira rede, com a mensagem combinada', async () => {
    const e = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    const { c } = clienteFalso({ update: e })
    expect(await atualizarProjeto(c, 'EXEMPLO-001', EM1, { etapa: 'PROGRAMADA' })).toEqual({
      ok: false, motivo: 'rede', mensagem: 'Não salvou: sem conexão. A mudança foi desfeita.',
    })
  })

  it('AbortError devolvido no campo error também vira rede, inclusive na releitura', async () => {
    const { c } = clienteFalso({ update: { data: null, error: { name: 'AbortError', message: 'AbortError: This operation was aborted' } } })
    expect(await atualizarProjeto(c, 'EXEMPLO-001', EM1, { etapa: 'PROGRAMADA' })).toMatchObject({ ok: false, motivo: 'rede' })
    const { c: c2 } = clienteFalso({
      update: { data: [], error: null },
      leitura: { data: null, error: { name: 'TimeoutError', message: 'timeout' } },
    })
    expect(await atualizarProjeto(c2, 'EXEMPLO-001', EM1, { etapa: 'PROGRAMADA' })).toMatchObject({ ok: false, motivo: 'rede' })
  })
})

describe('listarProjetos', () => {
  it('conta defeitos sem os removidos; sem defeitos usa a quantidade informada, ou 0', async () => {
    const { c } = clienteFalso({
      lista: [{
        error: null,
        data: [
          bruta('EXEMPLO-001', EM1, { defeitos: [{ situacao: 'pendente' }, { situacao: 'removido' }, { situacao: 'executado' }] }),
          bruta('EXEMPLO-002', EM1, { defeitos: [], qtd_defeitos_informada: 4 }),
          bruta('EXEMPLO-003', EM1, { defeitos: null }),
        ],
      }],
    })
    const r = await listarProjetos(c, 'SUL')
    expect(r.map((l) => l.qtd_defeitos)).toEqual([2, 4, 0])
    expect('defeitos' in r[0]).toBe(false)
  })

  it('filtra pela regional, exceto em TODAS, e junta as páginas de 1000', async () => {
    const cheia = Array.from({ length: 1000 }, (_, i) => bruta(`EXEMPLO-${i}`, EM1))
    const { c, chamadas } = clienteFalso({ lista: [{ error: null, data: cheia }, { error: null, data: [bruta('EXEMPLO-X', EM1)] }] })
    const r = await listarProjetos(c, 'TODAS')
    expect(r).toHaveLength(1001)
    expect(chamadas.some((x) => x.op === 'eq')).toBe(false)
    expect(chamadas.filter((x) => x.op === 'range').map((x) => x.args)).toEqual([[0, 999], [1000, 1999]])

    const outro = clienteFalso({ lista: [{ error: null, data: [] }] })
    await listarProjetos(outro.c, 'LESTE')
    expect(outro.chamadas).toContainEqual({ op: 'eq', args: ['regional', 'LESTE'] })
  })
})
