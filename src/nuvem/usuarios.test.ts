import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { chamarUsuarios } from './usuarios'

function clienteFalso(resposta: { data: unknown; error: unknown } | Error) {
  const invoke = vi.fn(async () => {
    if (resposta instanceof Error) throw resposta
    return resposta
  })
  return { c: { functions: { invoke } } as unknown as SupabaseClient, invoke }
}

// Como o supabase-js entrega uma resposta 4xx/5xx da função.
function erroHttp(status: number, corpo: unknown) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(corpo), { status }),
  }
}

describe('chamarUsuarios', () => {
  it('manda o pedido para a função usuarios e devolve ok', async () => {
    const { c, invoke } = clienteFalso({ data: { ok: true }, error: null })
    const pedido = { acao: 'reativar', id: '33333333-3333-4333-8333-333333333333' } as const
    await expect(chamarUsuarios(c, pedido)).resolves.toEqual({ ok: true })
    expect(invoke).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledWith('usuarios', { body: pedido })
  })

  it('mostra o erro em português que a função mandou', async () => {
    const { c } = clienteFalso({
      data: null,
      error: erroHttp(403, { ok: false, erro: 'Só administrador mexe em usuários.' }),
    })
    await expect(chamarUsuarios(c, { acao: 'desativar', id: 'x' })).resolves.toEqual({
      ok: false,
      erro: 'Só administrador mexe em usuários.',
    })
  })

  it('sem conexão, avisa da internet ou da VPN', async () => {
    const { c } = clienteFalso({
      data: null,
      error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' },
    })
    await expect(chamarUsuarios(c, { acao: 'reativar', id: 'x' })).resolves.toEqual({
      ok: false,
      erro: 'Sem conexão com o servidor. Confira a internet ou a VPN.',
    })
  })

  it('se o invoke estoura, avisa da conexão', async () => {
    const { c } = clienteFalso(new TypeError('Failed to fetch'))
    await expect(chamarUsuarios(c, { acao: 'reativar', id: 'x' })).resolves.toEqual({
      ok: false,
      erro: 'Sem conexão com o servidor. Confira a internet ou a VPN.',
    })
  })

  it('resposta sem erro legível vira mensagem genérica', async () => {
    const { c } = clienteFalso({ data: null, error: erroHttp(502, 'Bad Gateway') })
    await expect(chamarUsuarios(c, { acao: 'reativar', id: 'x' })).resolves.toEqual({
      ok: false,
      erro: 'Algo deu errado. Tente de novo.',
    })
  })
})
