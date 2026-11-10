import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { listarPessoas } from './perfil'

// Cliente mínimo: guarda as colunas pedidas e devolve as linhas combinadas.
function clienteCom(linhas: unknown[]) {
  const visto = { colunas: '' }
  const c = {
    from: () => ({
      select: (colunas: string) => {
        visto.colunas = colunas
        return { order: async () => ({ data: linhas, error: null }) }
      },
    }),
  } as unknown as SupabaseClient
  return { c, visto }
}

describe('listarPessoas', () => {
  it('pede o e-mail junto e usa o nome quando ele existe', async () => {
    const { c, visto } = clienteCom([{ id: 'a', nome: 'Ana Exemplo', email: 'ana@exemplo.test', ativo: true }])
    const lista = await listarPessoas(c)
    expect(visto.colunas).toContain('email')
    expect(lista).toEqual([{ id: 'a', nome: 'Ana Exemplo', ativo: true }])
  })

  it('conta criada pelo painel do Supabase (nome vazio) aparece pelo e-mail', async () => {
    const { c } = clienteCom([
      { id: 'a', nome: '', email: 'conta@exemplo.test', ativo: true },
      { id: 'b', nome: '   ', email: 'outra@exemplo.test', ativo: false },
    ])
    const lista = await listarPessoas(c)
    expect(lista.map((p) => p.nome)).toEqual(['conta@exemplo.test', 'outra@exemplo.test'])
  })

  it('ordena pelo nome mostrado, sem deixar os nomes vazios no topo', async () => {
    const { c } = clienteCom([
      { id: 'a', nome: '', email: 'zeca@exemplo.test', ativo: true },
      { id: 'b', nome: 'Bia Exemplo', email: 'bia@exemplo.test', ativo: true },
      { id: 'c', nome: '', email: 'ana@exemplo.test', ativo: true },
    ])
    const lista = await listarPessoas(c)
    expect(lista.map((p) => p.nome)).toEqual(['ana@exemplo.test', 'Bia Exemplo', 'zeca@exemplo.test'])
  })
})
