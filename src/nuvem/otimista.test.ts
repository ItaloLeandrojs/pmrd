// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjetoLinha, ResultadoGravacao } from './carteira'
import { useListaOtimista } from './otimista'

function linha(p: string, etapa: ProjetoLinha['etapa'] = 'EM ANÁLISE', em = 'v1'): ProjetoLinha {
  return {
    projeto: p, regional: 'SUL', origem: 'enel', municipio: null, prioridade: 5, pedido_gestor: false, pedido_gestor_em: null, pedido_gestor_por: null,
    qtd_defeitos: 1, alimentadores: [], etapa, etapa_desde: '2026-11-01T12:00:00+00:00',
    proxima_acao: null, prazo_proxima_acao: null, vistoria_data: null, responsavel: null, atualizado_em: em,
  }
}

const REDE: ResultadoGravacao = { ok: false, motivo: 'rede', mensagem: 'Não salvou: sem conexão. A mudança foi desfeita.' }

describe('useListaOtimista', () => {
  it('a linha muda na hora e, se o servidor aceita, ganha o atualizado_em novo', async () => {
    const { result } = renderHook(() => useListaOtimista([linha('EXEMPLO-001')], 'projeto'))
    let solta!: (r: ResultadoGravacao) => void
    const enviar = vi.fn(() => new Promise<ResultadoGravacao>((res) => { solta = res }))
    let promessa!: Promise<void>
    act(() => { promessa = result.current.gravar('EXEMPLO-001', { etapa: 'PROGRAMADA' }, enviar) })
    expect(result.current.linhas[0].etapa).toBe('PROGRAMADA') // antes de o servidor responder
    await act(async () => { solta({ ok: true, linha: linha('EXEMPLO-001', 'PROGRAMADA', 'v2') }); await promessa })
    expect(result.current.linhas[0]).toMatchObject({ etapa: 'PROGRAMADA', atualizado_em: 'v2' })
    expect(result.current.aviso).toBeNull()
  })

  it('sem rede: a linha volta ao valor anterior e aparece o aviso', async () => {
    const { result } = renderHook(() => useListaOtimista([linha('EXEMPLO-001')], 'projeto'))
    await act(async () => { await result.current.gravar('EXEMPLO-001', { etapa: 'PROGRAMADA' }, async () => REDE) })
    expect(result.current.linhas[0].etapa).toBe('EM ANÁLISE')
    expect(result.current.aviso).toBe('Não salvou: sem conexão. A mudança foi desfeita.')
  })

  it('conflito: a linha vira a versão do banco e aparece o aviso', async () => {
    const { result } = renderHook(() => useListaOtimista([linha('EXEMPLO-001')], 'projeto'))
    const atual = linha('EXEMPLO-001', 'SOLICITAR SGD', 'v9')
    await act(async () => {
      await result.current.gravar('EXEMPLO-001', { etapa: 'PROGRAMADA' }, async () => ({
        ok: false, motivo: 'conflito', mensagem: 'Outra pessoa mudou este projeto. Recarreguei a linha.', atual,
      }))
    })
    expect(result.current.linhas[0]).toEqual(atual)
    expect(result.current.aviso).toBe('Outra pessoa mudou este projeto. Recarreguei a linha.')
  })

  it('erro inesperado também desfaz a mudança, com aviso', async () => {
    const { result } = renderHook(() => useListaOtimista([linha('EXEMPLO-001')], 'projeto'))
    await act(async () => {
      await result.current.gravar('EXEMPLO-001', { etapa: 'PROGRAMADA' }, async () => { throw new Error('x') })
    })
    expect(result.current.linhas[0].etapa).toBe('EM ANÁLISE')
    expect(result.current.aviso).toMatch(/^Não salvou:/)
  })

  it('duas mudanças seguidas na mesma linha: a segunda usa o atualizado_em devolvido pela primeira', async () => {
    const { result } = renderHook(() => useListaOtimista([linha('EXEMPLO-001')], 'projeto'))
    const vistos: string[] = []
    await act(async () => {
      const a = result.current.gravar('EXEMPLO-001', { etapa: 'PROGRAMADA' }, async (l) => {
        vistos.push(l.atualizado_em)
        return { ok: true, linha: { ...l, atualizado_em: 'v2' } }
      })
      const b = result.current.gravar('EXEMPLO-001', { proxima_acao: 'ligar' }, async (l) => {
        vistos.push(l.atualizado_em)
        return { ok: true, linha: { ...l, atualizado_em: 'v3' } }
      })
      await Promise.all([a, b])
    })
    expect(vistos).toEqual(['v1', 'v2'])
    expect(result.current.linhas[0]).toMatchObject({ etapa: 'PROGRAMADA', proxima_acao: 'ligar', atualizado_em: 'v3' })
  })

  it('o aviso some sozinho depois de alguns segundos', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useListaOtimista([linha('EXEMPLO-001')], 'projeto'))
      await act(async () => { await result.current.gravar('EXEMPLO-001', { etapa: 'PROGRAMADA' }, async () => REDE) })
      expect(result.current.aviso).not.toBeNull()
      act(() => { vi.advanceTimersByTime(8000) })
      expect(result.current.aviso).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('useListaOtimista: fila por linha', () => {
  const CONFLITO = (atual: ProjetoLinha): ResultadoGravacao => ({
    ok: false, motivo: 'conflito', mensagem: 'Outra pessoa mudou este projeto. Recarreguei a linha.', atual,
  })

  it('a segunda mudança na mesma linha aparece na hora, mesmo com a primeira ainda no ar', async () => {
    const { result } = renderHook(() => useListaOtimista([linha('EXEMPLO-001')], 'projeto'))
    let solta!: (r: ResultadoGravacao) => void
    act(() => {
      void result.current.gravar('EXEMPLO-001', { etapa: 'PROGRAMADA' }, () => new Promise<ResultadoGravacao>((r) => { solta = r }))
      void result.current.gravar('EXEMPLO-001', { proxima_acao: 'ligar' }, async (l) => ({ ok: true, linha: l }))
    })
    expect(result.current.linhas[0]).toMatchObject({ etapa: 'PROGRAMADA', proxima_acao: 'ligar' })
    await act(async () => { solta({ ok: true, linha: linha('EXEMPLO-001', 'PROGRAMADA', 'v2') }) })
    // a resposta da primeira não apaga o que a segunda já mostrou
    expect(result.current.linhas[0]).toMatchObject({ etapa: 'PROGRAMADA', proxima_acao: 'ligar' })
  })

  it('conflito na primeira: a segunda não é enviada, a linha vira a do colega e o aviso fica', async () => {
    const { result } = renderHook(() => useListaOtimista([linha('EXEMPLO-001')], 'projeto'))
    const atual = { ...linha('EXEMPLO-001', 'SOLICITAR SGD', 'v9'), proxima_acao: 'Valor do colega' }
    const segunda = vi.fn(async (l: ProjetoLinha): Promise<ResultadoGravacao> => ({ ok: true, linha: l }))
    await act(async () => {
      const a = result.current.gravar('EXEMPLO-001', { etapa: 'PROGRAMADA' }, async () => CONFLITO(atual))
      const b = result.current.gravar('EXEMPLO-001', { proxima_acao: 'Cobrar' }, segunda)
      await Promise.all([a, b])
    })
    expect(segunda).not.toHaveBeenCalled()
    expect(result.current.linhas[0]).toEqual(atual)
    expect(result.current.aviso).toBe('Outra pessoa mudou este projeto. Recarreguei a linha.')
  })

  it('rede cai na primeira: as duas mudanças são desfeitas, a segunda não é enviada e o aviso fica', async () => {
    const { result } = renderHook(() => useListaOtimista([linha('EXEMPLO-001')], 'projeto'))
    const segunda = vi.fn(async (l: ProjetoLinha): Promise<ResultadoGravacao> => ({ ok: true, linha: l }))
    await act(async () => {
      const a = result.current.gravar('EXEMPLO-001', { etapa: 'PROGRAMADA' }, async () => REDE)
      const b = result.current.gravar('EXEMPLO-001', { etapa: 'SOLICITAR SGD', proxima_acao: 'Cobrar' }, segunda)
      await Promise.all([a, b])
    })
    expect(segunda).not.toHaveBeenCalled()
    expect(result.current.linhas[0]).toMatchObject({ etapa: 'EM ANÁLISE', proxima_acao: null })
    expect(result.current.aviso).toBe(REDE.mensagem)
  })

  it('o desfazer só mexe em campo que ainda tem o valor que aquela gravação pôs', async () => {
    const { result } = renderHook(() => useListaOtimista([linha('EXEMPLO-001')], 'projeto'))
    let solta!: (r: ResultadoGravacao) => void
    act(() => {
      void result.current.gravar('EXEMPLO-001', { etapa: 'PROGRAMADA' }, () => new Promise<ResultadoGravacao>((r) => { solta = r }))
    })
    act(() => { void result.current.gravar('EXEMPLO-001', { proxima_acao: 'x' }, () => new Promise(() => {})) })
    await act(async () => { solta(REDE) })
    expect(result.current.linhas[0].etapa).toBe('EM ANÁLISE')
    expect(result.current.linhas[0].proxima_acao).toBeNull()
  })

  it('começar outra gravação não apaga um aviso que já está na tela', async () => {
    const { result } = renderHook(() => useListaOtimista([linha('EXEMPLO-001'), linha('EXEMPLO-002')], 'projeto'))
    await act(async () => { await result.current.gravar('EXEMPLO-001', { etapa: 'PROGRAMADA' }, async () => REDE) })
    expect(result.current.aviso).toBe(REDE.mensagem)
    act(() => { void result.current.gravar('EXEMPLO-002', { etapa: 'PROGRAMADA' }, () => new Promise(() => {})) })
    expect(result.current.aviso).toBe(REDE.mensagem)
  })

  it('pendentes lista as linhas que ainda estão salvando', async () => {
    const { result } = renderHook(() => useListaOtimista([linha('EXEMPLO-001')], 'projeto'))
    let solta!: (r: ResultadoGravacao) => void
    expect(result.current.pendentes.has('EXEMPLO-001')).toBe(false)
    let p!: Promise<void>
    act(() => { p = result.current.gravar('EXEMPLO-001', { etapa: 'PROGRAMADA' }, () => new Promise<ResultadoGravacao>((r) => { solta = r })) })
    expect(result.current.pendentes.has('EXEMPLO-001')).toBe(true)
    await act(async () => { solta({ ok: true, linha: linha('EXEMPLO-001', 'PROGRAMADA', 'v2') }); await p })
    expect(result.current.pendentes.has('EXEMPLO-001')).toBe(false)
  })
})
