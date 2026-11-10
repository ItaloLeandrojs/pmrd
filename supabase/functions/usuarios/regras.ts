// Regras da função `usuarios`: quem pode pedir o quê.
// TypeScript puro, sem nada do Deno e sem importar do src/: este arquivo é
// colado sozinho no editor de Edge Functions do Supabase e o Vitest importa
// direto. Por isso o Papel é repetido aqui (igual ao de src/dominio/tipos.ts).

export type Papel = 'admin' | 'equipe'

export type PedidoUsuarios =
  | { acao: 'criar'; email: string; nome: string; papel: Papel; senha: string }
  | { acao: 'redefinir'; id: string; senha: string }
  | { acao: 'papel'; id: string; papel: Papel }
  | { acao: 'desativar' | 'reativar'; id: string }

export type Resultado =
  | { ok: true; pedido: PedidoUsuarios }
  | { ok: false; status: 400 | 403; erro: string }

export const SENHA_MINIMA = 8

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function recusa(erro: string): Resultado {
  return { ok: false, status: 400, erro }
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function ehPapel(v: unknown): v is Papel {
  return v === 'admin' || v === 'equipe'
}

// Depois de tirar `id` dos admins, sobra algum admin ativo?
function sobraAdmin(adminsAtivos: string[], id: string): boolean {
  return adminsAtivos.some((a) => a !== id)
}

export function validarPedido(
  corpo: unknown,
  quem: { id: string; papel: Papel; ativo: boolean },
  adminsAtivos: string[],
): Resultado {
  if (quem.papel !== 'admin' || !quem.ativo) {
    return { ok: false, status: 403, erro: 'Só administrador mexe em usuários.' }
  }
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) {
    return recusa('Pedido desconhecido.')
  }
  const c = corpo as Record<string, unknown>
  const senhaCurta = 'A senha provisória precisa de pelo menos 8 caracteres.'

  switch (c.acao) {
    case 'criar': {
      const email = texto(c.email).trim().toLowerCase()
      const nome = texto(c.nome).trim()
      const senha = texto(c.senha)
      if (!EMAIL.test(email)) return recusa('E-mail inválido.')
      if (!nome) return recusa('Escreva o nome da pessoa.')
      if (!ehPapel(c.papel)) return recusa('Papel inválido.')
      if (senha.length < SENHA_MINIMA) return recusa(senhaCurta)
      return { ok: true, pedido: { acao: 'criar', email, nome, papel: c.papel, senha } }
    }

    case 'redefinir': {
      const id = texto(c.id)
      const senha = texto(c.senha)
      if (!UUID.test(id)) return recusa('Usuário inválido.')
      if (senha.length < SENHA_MINIMA) return recusa(senhaCurta)
      return { ok: true, pedido: { acao: 'redefinir', id, senha } }
    }

    case 'papel': {
      const id = texto(c.id)
      if (!UUID.test(id)) return recusa('Usuário inválido.')
      if (!ehPapel(c.papel)) return recusa('Papel inválido.')
      if (c.papel === 'equipe') {
        if (id === quem.id) return recusa('Você não pode tirar o seu próprio acesso de administrador.')
        if (!sobraAdmin(adminsAtivos, id)) return recusa('O PMRD precisa de pelo menos um administrador ativo.')
      }
      return { ok: true, pedido: { acao: 'papel', id, papel: c.papel } }
    }

    case 'desativar': {
      const id = texto(c.id)
      if (!UUID.test(id)) return recusa('Usuário inválido.')
      if (id === quem.id) return recusa('Você não pode desativar a sua própria conta.')
      if (adminsAtivos.includes(id) && !sobraAdmin(adminsAtivos, id)) {
        return recusa('O PMRD precisa de pelo menos um administrador ativo.')
      }
      return { ok: true, pedido: { acao: 'desativar', id } }
    }

    case 'reativar': {
      const id = texto(c.id)
      if (!UUID.test(id)) return recusa('Usuário inválido.')
      return { ok: true, pedido: { acao: 'reativar', id } }
    }

    default:
      return recusa('Pedido desconhecido.')
  }
}
