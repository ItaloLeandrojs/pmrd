// Cliente único do Supabase. Fica null quando faltam as variáveis públicas (dev sem .env.local).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined
const chave = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined

export const nuvem: SupabaseClient | null = url && chave ? createClient(url, chave) : null
