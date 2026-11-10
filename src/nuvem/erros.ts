// Traduz erros do Supabase e da rede em frases para a tela (pt-BR).
const SEM_CONEXAO = 'Sem conexão com o servidor. Confira a internet ou a VPN.'
const GENERICO = 'Algo deu errado. Tente de novo.'
export const CONTA_DESATIVADA = 'Esta conta está desativada. Fale com o administrador.'
/** Gravação que o banco recusou sem erro (RLS filtrou a linha): 0 linhas afetadas. */
export class NadaGravado extends Error {
  constructor() {
    super('nada gravado')
    this.name = 'NadaGravado'
  }
}

export function mensagemDeErro(e: unknown): string {
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) return SEM_CONEXAO
  if (e instanceof NadaGravado) return 'Não foi gravado. Confira se a sua conta ainda é de administrador e tente de novo.'
  const obj = (typeof e === 'object' && e !== null ? e : {}) as { message?: unknown; name?: unknown; code?: unknown }
  const msg = typeof obj.message === 'string' ? obj.message : ''
  // Conta desativada pelo administrador: o Supabase recusa o login como "banned".
  if (obj.code === 'user_banned' || /user is banned/i.test(msg)) return CONTA_DESATIVADA
  if (obj.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|load failed/i.test(msg)) return SEM_CONEXAO
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha não conferem.'
  if (/new password should be different/i.test(msg)) return 'A nova senha precisa ser diferente da atual.'
  if (/password should be at least/i.test(msg)) return 'A senha precisa de pelo menos 8 caracteres.'
  return GENERICO
}
