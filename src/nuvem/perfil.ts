// Perfil da pessoa que entrou e preferências guardadas no banco.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FiltroRegional, Papel, Tema } from '../dominio/tipos'

export interface Perfil {
  id: string
  email: string
  nome: string
  papel: Papel
  ativo: boolean
  senha_provisoria: boolean
  regional_preferida: FiltroRegional
  tema: Tema
}

const COLUNAS = 'id, email, nome, papel, ativo, senha_provisoria, regional_preferida, tema'

export async function carregarPerfil(c: SupabaseClient): Promise<Perfil> {
  const { data: u, error: eu } = await c.auth.getUser()
  if (eu) throw eu
  if (!u.user) throw new Error('Sem sessão.')
  const { data, error } = await c.from('perfis').select(COLUNAS).eq('id', u.user.id).single()
  if (error) throw error
  return data as Perfil
}

export async function guardarPreferencias(c: SupabaseClient, regional: FiltroRegional, tema: Tema): Promise<void> {
  const { error } = await c.rpc('guardar_preferencias', { p_regional: regional, p_tema: tema })
  if (error) throw error
}

/**
 * Pessoas do PCM para Responsável e histórico. Conta criada pelo painel do Supabase tem nome vazio:
 * nesse caso o e-mail ocupa o lugar do nome, para a opção e o histórico nunca ficarem em branco.
 */
export async function listarPessoas(c: SupabaseClient): Promise<{ id: string; nome: string; ativo: boolean }[]> {
  const { data, error } = await c.from('perfis').select('id, nome, email, ativo').order('nome')
  if (error) throw error
  const linhas = (data ?? []) as { id: string; nome: string | null; email: string | null; ativo: boolean }[]
  return linhas
    .map((p) => ({ id: p.id, nome: (p.nome ?? '').trim() || p.email || '', ativo: p.ativo }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
}
