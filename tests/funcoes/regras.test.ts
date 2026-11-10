import { describe, expect, it } from 'vitest'
import { validarPedido } from '../../supabase/functions/usuarios/regras'

const EU = '11111111-1111-4111-8111-111111111111'
const OUTRO_ADMIN = '22222222-2222-4222-8222-222222222222'
const DA_EQUIPE = '33333333-3333-4333-8333-333333333333'

const admin = { id: EU, papel: 'admin' as const, ativo: true }
const admins = [EU, OUTRO_ADMIN]

const criar = {
  acao: 'criar',
  email: 'pessoa@exemplo.com',
  nome: 'Pessoa Exemplo',
  papel: 'equipe',
  senha: '12345678',
}

describe('validarPedido: quem pode', () => {
  it('quem é da equipe não mexe em usuários', () => {
    const r = validarPedido(criar, { id: DA_EQUIPE, papel: 'equipe', ativo: true }, admins)
    expect(r).toEqual({ ok: false, status: 403, erro: 'Só administrador mexe em usuários.' })
  })

  it('admin desativado não mexe em usuários', () => {
    const r = validarPedido(criar, { id: EU, papel: 'admin', ativo: false }, admins)
    expect(r).toEqual({ ok: false, status: 403, erro: 'Só administrador mexe em usuários.' })
  })

  it('quem não é admin recebe 403 até com pedido desconhecido', () => {
    const r = validarPedido({ acao: 'apagar' }, { id: DA_EQUIPE, papel: 'equipe', ativo: true }, admins)
    expect(r).toEqual({ ok: false, status: 403, erro: 'Só administrador mexe em usuários.' })
  })
})

describe('validarPedido: criar', () => {
  it('senha de 7 caracteres não serve', () => {
    const r = validarPedido({ ...criar, senha: '1234567' }, admin, admins)
    expect(r).toEqual({ ok: false, status: 400, erro: 'A senha provisória precisa de pelo menos 8 caracteres.' })
  })

  it('e-mail sem @ não serve', () => {
    const r = validarPedido({ ...criar, email: 'pessoa.exemplo.com' }, admin, admins)
    expect(r).toEqual({ ok: false, status: 400, erro: 'E-mail inválido.' })
  })

  it('nome vazio não serve', () => {
    const r = validarPedido({ ...criar, nome: '   ' }, admin, admins)
    expect(r).toEqual({ ok: false, status: 400, erro: 'Escreva o nome da pessoa.' })
  })

  it('papel fora da lista não serve', () => {
    const r = validarPedido({ ...criar, papel: 'dono' }, admin, admins)
    expect(r).toEqual({ ok: false, status: 400, erro: 'Papel inválido.' })
  })

  it('pedido válido volta com o e-mail em minúsculas e sem espaços', () => {
    const r = validarPedido(
      { ...criar, email: '  Pessoa@Exemplo.COM ', nome: ' Pessoa Exemplo ', extra: 'ignorado' },
      admin,
      admins,
    )
    expect(r).toEqual({
      ok: true,
      pedido: {
        acao: 'criar',
        email: 'pessoa@exemplo.com',
        nome: 'Pessoa Exemplo',
        papel: 'equipe',
        senha: '12345678',
      },
    })
  })
})

describe('validarPedido: redefinir', () => {
  it('senha curta não serve', () => {
    const r = validarPedido({ acao: 'redefinir', id: DA_EQUIPE, senha: 'abc' }, admin, admins)
    expect(r).toEqual({ ok: false, status: 400, erro: 'A senha provisória precisa de pelo menos 8 caracteres.' })
  })

  it('id que não é de usuário não serve', () => {
    const r = validarPedido({ acao: 'redefinir', id: 'qualquer', senha: '12345678' }, admin, admins)
    expect(r).toEqual({ ok: false, status: 400, erro: 'Usuário inválido.' })
  })

  it('pedido válido', () => {
    const r = validarPedido({ acao: 'redefinir', id: DA_EQUIPE, senha: '12345678' }, admin, admins)
    expect(r).toEqual({ ok: true, pedido: { acao: 'redefinir', id: DA_EQUIPE, senha: '12345678' } })
  })
})

describe('validarPedido: admin tirando o próprio acesso', () => {
  it('não pode passar o próprio id para equipe', () => {
    const r = validarPedido({ acao: 'papel', id: EU, papel: 'equipe' }, admin, admins)
    expect(r).toEqual({
      ok: false,
      status: 400,
      erro: 'Você não pode tirar o seu próprio acesso de administrador.',
    })
  })

  it('não pode desativar o próprio id', () => {
    const r = validarPedido({ acao: 'desativar', id: EU }, admin, admins)
    expect(r).toEqual({ ok: false, status: 400, erro: 'Você não pode desativar a sua própria conta.' })
  })

  it('não pode passar o último admin ativo para equipe (dados velhos na tela)', () => {
    const r = validarPedido({ acao: 'papel', id: OUTRO_ADMIN, papel: 'equipe' }, admin, [OUTRO_ADMIN])
    expect(r).toEqual({ ok: false, status: 400, erro: 'O PMRD precisa de pelo menos um administrador ativo.' })
  })

  it('não pode desativar o último admin ativo (dados velhos na tela)', () => {
    const r = validarPedido({ acao: 'desativar', id: OUTRO_ADMIN }, admin, [OUTRO_ADMIN])
    expect(r).toEqual({ ok: false, status: 400, erro: 'O PMRD precisa de pelo menos um administrador ativo.' })
  })

  it('pode passar outro admin para equipe quando sobra um admin ativo', () => {
    const r = validarPedido({ acao: 'papel', id: OUTRO_ADMIN, papel: 'equipe' }, admin, admins)
    expect(r).toEqual({ ok: true, pedido: { acao: 'papel', id: OUTRO_ADMIN, papel: 'equipe' } })
  })

  it('pode desativar alguém da equipe mesmo com um só admin ativo', () => {
    const r = validarPedido({ acao: 'desativar', id: DA_EQUIPE }, admin, [EU])
    expect(r).toEqual({ ok: true, pedido: { acao: 'desativar', id: DA_EQUIPE } })
  })

  it('pode promover a si mesmo (já é admin) e outros para admin', () => {
    const r = validarPedido({ acao: 'papel', id: DA_EQUIPE, papel: 'admin' }, admin, [EU])
    expect(r).toEqual({ ok: true, pedido: { acao: 'papel', id: DA_EQUIPE, papel: 'admin' } })
  })

  it('reativar é aceito', () => {
    const r = validarPedido({ acao: 'reativar', id: DA_EQUIPE }, admin, admins)
    expect(r).toEqual({ ok: true, pedido: { acao: 'reativar', id: DA_EQUIPE } })
  })
})

describe('validarPedido: pedido desconhecido', () => {
  it.each([
    ['acao desconhecida', { acao: 'apagar', id: DA_EQUIPE }],
    ['sem acao', { id: DA_EQUIPE }],
    ['corpo nulo', null],
    ['corpo texto', 'criar'],
    ['corpo lista', [criar]],
  ])('%s', (_nome, corpo) => {
    expect(validarPedido(corpo, admin, admins)).toEqual({ ok: false, status: 400, erro: 'Pedido desconhecido.' })
  })
})
