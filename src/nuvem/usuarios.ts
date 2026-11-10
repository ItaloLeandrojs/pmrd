// Chama a Edge Function `usuarios` (contas e senhas, só para administrador).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PedidoUsuarios } from '../../supabase/functions/usuarios/regras'

export type { PedidoUsuarios }

const SEM_CONEXAO = 'Sem conexão com o servidor. Confira a internet ou a VPN.'
const GENERICO = 'Algo deu errado. Tente de novo.'

type Resposta = { ok: true } | { ok: false; erro: string }

function erroDoCorpo(corpo: unknown): string | null {
  if (typeof corpo === 'object' && corpo !== null && 'erro' in corpo) {
    const erro = (corpo as { erro: unknown }).erro
    if (typeof erro === 'string' && erro) return erro
  }
  return null
}

// Resposta 4xx/5xx: o supabase-js guarda a Response em error.context.
async function erroDaResposta(error: unknown): Promise<string> {
  const e = error as { name?: unknown; context?: unknown }
  if (e?.name === 'FunctionsFetchError') return SEM_CONEXAO
  const ctx = e?.context as { json?: () => Promise<unknown> } | undefined
  if (ctx && typeof ctx.json === 'function') {
    try {
      return erroDoCorpo(await ctx.json()) ?? GENERICO
    } catch {
      return GENERICO
    }
  }
  return GENERICO
}

export async function chamarUsuarios(c: SupabaseClient, pedido: PedidoUsuarios): Promise<Resposta> {
  try {
    const { data, error } = await c.functions.invoke('usuarios', { body: pedido })
    if (error) return { ok: false, erro: await erroDaResposta(error) }
    if (typeof data === 'object' && data !== null && (data as { ok?: unknown }).ok === true) return { ok: true }
    return { ok: false, erro: erroDoCorpo(data) ?? GENERICO }
  } catch {
    return { ok: false, erro: SEM_CONEXAO }
  }
}
