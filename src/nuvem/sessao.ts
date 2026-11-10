// Estado da sessão: carregando, fora ou dentro (com perfil ativo).
import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CONTA_DESATIVADA, mensagemDeErro } from './erros'
import { carregarPerfil, type Perfil } from './perfil'

export type EstadoSessao = 'carregando' | 'fora' | 'dentro'

export function useSessao(c: SupabaseClient | null) {
  const [estado, setEstado] = useState<EstadoSessao>('carregando')
  const [perfil, setPerfil] = useState<Perfil | null>(null)

  // Lê o perfil; conta inativa ou sem perfil é tratada como fora.
  const abrir = useCallback(async (cli: SupabaseClient): Promise<string | null> => {
    try {
      const p = await carregarPerfil(cli)
      if (!p.ativo) {
        await cli.auth.signOut()
        setPerfil(null)
        setEstado('fora')
        return CONTA_DESATIVADA
      }
      setPerfil(p)
      setEstado('dentro')
      return null
    } catch (e) {
      setPerfil(null)
      setEstado('fora')
      return mensagemDeErro(e)
    }
  }, [])

  useEffect(() => {
    if (!c) {
      setEstado('fora')
      return
    }
    let vivo = true
    c.auth.getSession().then(({ data }) => {
      if (!vivo) return
      if (data.session) void abrir(c)
      else setEstado('fora')
    }).catch(() => vivo && setEstado('fora'))
    const { data: assin } = c.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT' && vivo) {
        setPerfil(null)
        setEstado('fora')
      }
    })
    return () => {
      vivo = false
      assin.subscription.unsubscribe()
    }
  }, [c, abrir])

  const entrar = useCallback(async (email: string, senha: string): Promise<string | null> => {
    if (!c) return 'O site não está ligado ao servidor (faltam as variáveis do Supabase).'
    const { error } = await c.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) return mensagemDeErro(error)
    return abrir(c)
  }, [c, abrir])

  const sair = useCallback(async (): Promise<void> => {
    if (c) await c.auth.signOut()
    setPerfil(null)
    setEstado('fora')
  }, [c])

  const trocarSenha = useCallback(async (nova: string): Promise<string | null> => {
    if (!c) return 'O site não está ligado ao servidor (faltam as variáveis do Supabase).'
    const { error } = await c.auth.updateUser({ password: nova })
    if (error) return mensagemDeErro(error)
    const { error: e2 } = await c.rpc('marcar_senha_trocada')
    if (e2) return mensagemDeErro(e2)
    return abrir(c)
  }, [c, abrir])

  return { estado, perfil, entrar, sair, trocarSenha }
}
