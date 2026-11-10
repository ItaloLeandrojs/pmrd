import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useSessao } from './sessao'

const PERFIL = {
  id: 'u1', email: 'a@exemplo.test', nome: 'Teste', papel: 'equipe', ativo: true,
  senha_provisoria: true, regional_preferida: 'TODAS', tema: 'sistema',
}

function falso(opts: { updateErro?: unknown; ativo?: boolean } = {}) {
  const chamadas: string[] = []
  const c = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn().mockImplementation(async () => { chamadas.push('entrar'); return { error: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
      updateUser: vi.fn().mockImplementation(async () => { chamadas.push('updateUser'); return { error: opts.updateErro ?? null } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: vi.fn().mockImplementation(async (nome: string) => { chamadas.push(nome); return { error: null } }),
    from: vi.fn().mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { ...PERFIL, ativo: opts.ativo ?? true }, error: null }) }) }),
    }),
  }
  return { c: c as unknown as SupabaseClient, chamadas }
}

describe('useSessao', () => {
  it('sem cliente fica fora', async () => {
    const { result } = renderHook(() => useSessao(null))
    await waitFor(() => expect(result.current.estado).toBe('fora'))
  })

  it('entrar leva a dentro com o perfil', async () => {
    const { c } = falso()
    const { result } = renderHook(() => useSessao(c))
    await waitFor(() => expect(result.current.estado).toBe('fora'))
    let erro: string | null = 'x'
    await act(async () => { erro = await result.current.entrar('a@exemplo.test', 'senha1234') })
    expect(erro).toBeNull()
    expect(result.current.estado).toBe('dentro')
    expect(result.current.perfil?.nome).toBe('Teste')
  })

  it('conta desativada volta para fora com aviso', async () => {
    const { c } = falso({ ativo: false })
    const { result } = renderHook(() => useSessao(c))
    await waitFor(() => expect(result.current.estado).toBe('fora'))
    let erro: string | null = null
    await act(async () => { erro = await result.current.entrar('a@exemplo.test', 'senha1234') })
    expect(erro).toContain('desativada')
    expect(result.current.estado).toBe('fora')
  })

  it('trocarSenha faz updateUser e depois marcar_senha_trocada', async () => {
    const { c, chamadas } = falso()
    const { result } = renderHook(() => useSessao(c))
    await waitFor(() => expect(result.current.estado).toBe('fora'))
    await act(async () => { await result.current.trocarSenha('novaSenha1') })
    expect(chamadas).toEqual(['updateUser', 'marcar_senha_trocada'])
  })

  it('se updateUser falha, não marca a senha como trocada', async () => {
    const { c, chamadas } = falso({ updateErro: { message: 'Failed to fetch' } })
    const { result } = renderHook(() => useSessao(c))
    await waitFor(() => expect(result.current.estado).toBe('fora'))
    let erro: string | null = null
    await act(async () => { erro = await result.current.trocarSenha('novaSenha1') })
    expect(erro).toContain('Sem conexão')
    expect(chamadas).toEqual(['updateUser'])
  })
})
