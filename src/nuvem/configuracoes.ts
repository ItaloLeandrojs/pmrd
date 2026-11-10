// Leitura e gravação das configurações (só administrador grava; o banco garante).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Papel, Regional, TipoEquipe } from '../dominio/tipos'

export interface Equipe {
  lid: string
  chefe: string
  tipo: TipoEquipe
  regional: Regional
  grupo_report: string | null
  base: string | null
  ativa: boolean
  foto_path: string | null
}

export interface Parametros {
  validade_vistoria: number
  prazo_reenvio_vistoria: number
  alerta_vencimento: number
  alerta_prazo: number
  parado_amarelo: number
  parado_vermelho: number
  raio_mapa_km: number
}

export interface Motivo { id: string; nome: string; ativo: boolean; ordem: number }
export interface Solicitante { id: string; nome: string; email: string | null; ativo: boolean }
export interface Usuario {
  id: string
  email: string
  nome: string
  papel: Papel
  ativo: boolean
  senha_provisoria: boolean
}

const COLUNAS_EQUIPE = 'lid, chefe, tipo, regional, grupo_report, base, ativa, foto_path'
const COLUNAS_PARAMETROS =
  'validade_vistoria, prazo_reenvio_vistoria, alerta_vencimento, alerta_prazo, parado_amarelo, parado_vermelho, raio_mapa_km'

export async function listarEquipes(c: SupabaseClient): Promise<Equipe[]> {
  const { data, error } = await c.from('equipes').select(COLUNAS_EQUIPE).order('lid')
  if (error) throw error
  return (data ?? []) as Equipe[]
}

export async function salvarEquipe(c: SupabaseClient, e: Equipe): Promise<void> {
  const { error } = await c.from('equipes').upsert(e, { onConflict: 'lid' })
  if (error) throw error
}

export async function listarMotivos(c: SupabaseClient): Promise<Motivo[]> {
  const { data, error } = await c.from('motivos').select('id, nome, ativo, ordem').order('ordem').order('nome')
  if (error) throw error
  return (data ?? []) as Motivo[]
}

export async function novoMotivo(c: SupabaseClient, nome: string, ordem: number): Promise<void> {
  const { error } = await c.from('motivos').insert({ nome, ordem, ativo: true })
  if (error) throw error
}

/** Motivo nunca se apaga: o histórico do Report usa o nome. Só muda nome, ordem e ativo. */
export async function salvarMotivo(c: SupabaseClient, m: Motivo): Promise<void> {
  const { error } = await c.from('motivos').update({ nome: m.nome, ordem: m.ordem, ativo: m.ativo }).eq('id', m.id)
  if (error) throw error
}

export async function listarSolicitantes(c: SupabaseClient): Promise<Solicitante[]> {
  const { data, error } = await c.from('solicitantes_sgd').select('id, nome, email, ativo').order('nome')
  if (error) throw error
  return (data ?? []) as Solicitante[]
}

export async function novoSolicitante(c: SupabaseClient, nome: string, email: string | null): Promise<void> {
  const { error } = await c.from('solicitantes_sgd').insert({ nome, email, ativo: true })
  if (error) throw error
}

/** Solicitante nunca se apaga: só se desativa. */
export async function salvarSolicitante(c: SupabaseClient, s: Solicitante): Promise<void> {
  const { error } = await c.from('solicitantes_sgd').update({ nome: s.nome, email: s.email, ativo: s.ativo }).eq('id', s.id)
  if (error) throw error
}

export async function carregarParametros(c: SupabaseClient): Promise<Parametros> {
  const { data, error } = await c.from('parametros').select(COLUNAS_PARAMETROS).eq('id', 1).single()
  if (error) throw error
  return data as Parametros
}

export async function salvarParametros(c: SupabaseClient, p: Parametros): Promise<void> {
  const { error } = await c.from('parametros').update(p).eq('id', 1)
  if (error) throw error
}

export async function listarUsuarios(c: SupabaseClient): Promise<Usuario[]> {
  const { data, error } = await c.from('perfis').select('id, email, nome, papel, ativo, senha_provisoria').order('nome')
  if (error) throw error
  return (data ?? []) as Usuario[]
}
