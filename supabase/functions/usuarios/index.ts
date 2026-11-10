// Edge Function `usuarios`: o administrador cria contas, redefine senhas,
// muda papel e desativa ou reativa pessoas, sem a chave secreta sair do Supabase.
// POST /functions/v1/usuarios com um PedidoUsuarios no corpo (ver regras.ts).
// Resposta: { ok: true } ou { ok: false, erro } (erro em português).
//
// Quem chama é conferido pelo login (Authorization), nunca pelo corpo.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY o próprio Supabase injeta.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import { type PedidoUsuarios, validarPedido } from './regras.ts'

const ORIGENS = ['https://italoleandrojs.github.io', 'http://localhost:4321']
const BANIDO_PARA_SEMPRE = '876000h' // 100 anos

type Admin = SupabaseClient

function cabecalhos(req: Request): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', Vary: 'Origin' }
  const origem = req.headers.get('Origin')
  if (origem && ORIGENS.includes(origem)) {
    h['Access-Control-Allow-Origin'] = origem
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    h['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type, x-region'
    h['Access-Control-Max-Age'] = '86400'
  }
  return h
}

function responder(req: Request, status: number, corpo: { ok: true } | { ok: false; erro: string }): Response {
  return new Response(JSON.stringify(corpo), { status, headers: cabecalhos(req) })
}

class Falha extends Error {
  constructor(readonly status: number, readonly erro: string) {
    super(erro)
  }
}

function codigoDoErro(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : ''
}

function erroDoAuth(e: unknown, padrao: string): Falha {
  const codigo = codigoDoErro(e)
  if (codigo === 'email_exists' || codigo === 'user_already_exists') {
    return new Falha(400, 'Já existe uma conta com este e-mail.')
  }
  if (codigo === 'user_not_found') return new Falha(404, 'Usuário não encontrado.')
  if (codigo === 'weak_password') {
    return new Falha(400, 'A senha provisória precisa de pelo menos 8 caracteres.')
  }
  return new Falha(500, padrao)
}

// Muda a linha do perfil e confere que ela existia.
async function mudarPerfil(admin: Admin, id: string, campos: Record<string, unknown>, padrao: string) {
  const { data, error } = await admin.from('perfis').update(campos).eq('id', id).select('id')
  if (error) throw new Falha(500, padrao)
  if (!data || data.length === 0) throw new Falha(404, 'Usuário não encontrado.')
}

async function executar(admin: Admin, pedido: PedidoUsuarios): Promise<void> {
  switch (pedido.acao) {
    case 'criar': {
      const { data, error } = await admin.auth.admin.createUser({
        email: pedido.email,
        password: pedido.senha,
        email_confirm: true,
      })
      if (error || !data.user) throw erroDoAuth(error, 'Não deu para criar a conta. Tente de novo.')
      const id = data.user.id
      // O gatilho do banco já criou o perfil só com o e-mail; aqui entram nome e papel.
      const { data: linhas, error: erroPerfil } = await admin
        .from('perfis')
        .update({ nome: pedido.nome, papel: pedido.papel, senha_provisoria: true })
        .eq('id', id)
        .select('id')
      if (erroPerfil || !linhas || linhas.length === 0) {
        // Não deixa conta pela metade: sem perfil certo, a conta sai.
        await admin.auth.admin.deleteUser(id)
        throw new Falha(500, 'Não deu para criar a conta. Tente de novo.')
      }
      return
    }

    case 'redefinir': {
      const { error } = await admin.auth.admin.updateUserById(pedido.id, { password: pedido.senha })
      if (error) throw erroDoAuth(error, 'Não deu para redefinir a senha. Tente de novo.')
      await mudarPerfil(
        admin,
        pedido.id,
        { senha_provisoria: true },
        'A senha mudou, mas não deu para marcar como provisória. Tente de novo.',
      )
      return
    }

    case 'papel':
      await mudarPerfil(admin, pedido.id, { papel: pedido.papel }, 'Não deu para mudar o papel. Tente de novo.')
      return

    case 'desativar':
    case 'reativar': {
      const desativar = pedido.acao === 'desativar'
      const padrao = desativar
        ? 'Não deu para desativar a conta. Tente de novo.'
        : 'Não deu para reativar a conta. Tente de novo.'
      const { error } = await admin.auth.admin.updateUserById(pedido.id, {
        ban_duration: desativar ? BANIDO_PARA_SEMPRE : 'none',
      })
      if (error) throw erroDoAuth(error, padrao)
      await mudarPerfil(admin, pedido.id, { ativo: !desativar }, padrao)
      return
    }
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabecalhos(req) })
  if (req.method !== 'POST') return responder(req, 405, { ok: false, erro: 'Use POST.' })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !chave) throw new Falha(500, 'A função não está configurada.')
    const admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } })

    // 1. Quem chama, pelo login.
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!jwt) throw new Falha(401, 'Entre no site para fazer isso.')
    const { data: sessao, error: erroSessao } = await admin.auth.getUser(jwt)
    if (erroSessao || !sessao.user) throw new Falha(401, 'Sua sessão expirou. Entre de novo.')

    // 2. Perfil de quem chama e admins ativos, lidos com a chave de serviço.
    const { data: perfil, error: erroPerfil } = await admin
      .from('perfis')
      .select('id, papel, ativo')
      .eq('id', sessao.user.id)
      .maybeSingle()
    if (erroPerfil) throw new Falha(500, 'Não deu para conferir o seu acesso. Tente de novo.')
    if (!perfil) throw new Falha(403, 'Só administrador mexe em usuários.')

    const { data: admins, error: erroAdmins } = await admin
      .from('perfis')
      .select('id')
      .eq('papel', 'admin')
      .eq('ativo', true)
    if (erroAdmins || !admins) throw new Falha(500, 'Não deu para conferir os administradores. Tente de novo.')

    // 3. O pedido.
    let corpo: unknown = null
    try {
      corpo = await req.json()
    } catch {
      corpo = null
    }
    const quem = {
      id: String(perfil.id),
      papel: perfil.papel === 'admin' ? ('admin' as const) : ('equipe' as const),
      ativo: perfil.ativo === true,
    }
    const r = validarPedido(
      corpo,
      quem,
      admins.map((a: { id: unknown }) => String(a.id)),
    )
    if (!r.ok) return responder(req, r.status, { ok: false, erro: r.erro })

    // 4. Executa.
    await executar(admin, r.pedido)
    return responder(req, 200, { ok: true })
  } catch (e) {
    if (e instanceof Falha) return responder(req, e.status, { ok: false, erro: e.erro })
    console.error('usuarios: erro inesperado', e instanceof Error ? e.message : e)
    return responder(req, 500, { ok: false, erro: 'Algo deu errado. Tente de novo.' })
  }
})
