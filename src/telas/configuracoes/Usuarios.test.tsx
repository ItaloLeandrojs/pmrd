import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../nuvem/configuracoes', () => ({ listarUsuarios: vi.fn() }))
vi.mock('../../nuvem/usuarios', () => ({ chamarUsuarios: vi.fn() }))

import { listarUsuarios, type Usuario } from '../../nuvem/configuracoes'
import { chamarUsuarios } from '../../nuvem/usuarios'
import { Usuarios } from './Usuarios'

const c = {} as SupabaseClient
const EU = '11111111-1111-4111-8111-111111111111'
const OUTRA = '22222222-2222-4222-8222-222222222222'

const lista: Usuario[] = [
  { id: EU, email: 'admin@exemplo.test', nome: 'Admin Exemplo', papel: 'admin', ativo: true, senha_provisoria: false },
  { id: OUTRA, email: 'pessoa@exemplo.test', nome: 'Pessoa Exemplo', papel: 'equipe', ativo: true, senha_provisoria: false },
]

beforeEach(() => {
  vi.mocked(listarUsuarios).mockReset().mockResolvedValue(lista)
  vi.mocked(chamarUsuarios).mockReset().mockResolvedValue({ ok: true })
})

async function linha(nome: string) {
  const celula = await screen.findByText(nome)
  return within(celula.closest('li') as HTMLElement)
}

describe('Usuarios', () => {
  it('o título do formulário é de nível 2 (sem pular nível)', async () => {
    render(<Usuarios c={c} meuId={EU} />)
    await screen.findByText('Pessoa Exemplo')
    expect(screen.getByRole('heading', { name: 'Nova conta', level: 2 })).toBeTruthy()
  })

  it('Redefinir senha abre o campo e chama chamarUsuarios com id e senha', async () => {
    render(<Usuarios c={c} meuId={EU} />)
    const l = await linha('Pessoa Exemplo')
    await userEvent.click(l.getByRole('button', { name: 'Redefinir senha' }))
    await userEvent.type(l.getByLabelText('Senha provisória'), 'provisoria123')
    await userEvent.click(l.getByRole('button', { name: 'Salvar senha' }))
    expect(chamarUsuarios).toHaveBeenCalledWith(c, { acao: 'redefinir', id: OUTRA, senha: 'provisoria123' })
  })

  it('Redefinir senha fica marcado (aria-expanded) com o campo aberto, e o cursor vai para a senha', async () => {
    render(<Usuarios c={c} meuId={EU} />)
    const l = await linha('Pessoa Exemplo')
    const botao = l.getByRole('button', { name: 'Redefinir senha' })
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(botao)
    expect(botao.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(l.getByLabelText('Senha provisória'))
    await userEvent.click(botao)
    expect(botao.getAttribute('aria-expanded')).toBe('false')
  })

  it('mostra o erro devolvido em role="alert"', async () => {
    vi.mocked(chamarUsuarios).mockResolvedValue({ ok: false, erro: 'A senha provisória precisa de pelo menos 8 caracteres.' })
    render(<Usuarios c={c} meuId={EU} />)
    const l = await linha('Pessoa Exemplo')
    await userEvent.click(l.getByRole('button', { name: 'Redefinir senha' }))
    await userEvent.type(l.getByLabelText('Senha provisória'), 'curta')
    await userEvent.click(l.getByRole('button', { name: 'Salvar senha' }))
    expect((await screen.findByRole('alert')).textContent).toContain('pelo menos 8 caracteres')
  })

  it('a própria linha do admin não tem Desativar nem Tornar equipe', async () => {
    render(<Usuarios c={c} meuId={EU} />)
    const eu = await linha('Admin Exemplo')
    expect(eu.queryByRole('button', { name: 'Desativar' })).toBeNull()
    expect(eu.queryByRole('button', { name: 'Tornar equipe' })).toBeNull()
    const outra = await linha('Pessoa Exemplo')
    expect(outra.getByRole('button', { name: 'Desativar' })).toBeTruthy()
    expect(outra.getByRole('button', { name: 'Tornar admin' })).toBeTruthy()
  })

  it('Desativar chama a função e recarrega a lista', async () => {
    render(<Usuarios c={c} meuId={EU} />)
    const l = await linha('Pessoa Exemplo')
    await userEvent.click(l.getByRole('button', { name: 'Desativar' }))
    expect(chamarUsuarios).toHaveBeenCalledWith(c, { acao: 'desativar', id: OUTRA })
    await vi.waitFor(() => expect(vi.mocked(listarUsuarios).mock.calls.length).toBe(2))
  })

  it('cria a conta com nome, e-mail, papel e senha provisória', async () => {
    render(<Usuarios c={c} meuId={EU} />)
    await screen.findByText('Pessoa Exemplo')
    await userEvent.type(screen.getByLabelText('Nome'), 'Nova Pessoa')
    await userEvent.type(screen.getByLabelText('E-mail'), 'nova@exemplo.test')
    await userEvent.type(screen.getByLabelText('Senha provisória da conta'), 'provisoria123')
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(chamarUsuarios).toHaveBeenCalledWith(c, {
      acao: 'criar', nome: 'Nova Pessoa', email: 'nova@exemplo.test', papel: 'equipe', senha: 'provisoria123',
    })
  })

  it('conta sem nome mostra o e-mail como nome, uma vez só', async () => {
    vi.mocked(listarUsuarios).mockResolvedValue([
      lista[0],
      { id: OUTRA, email: 'sem-nome@exemplo.test', nome: '', papel: 'equipe', ativo: true, senha_provisoria: false },
    ])
    render(<Usuarios c={c} meuId={EU} />)
    const l = await linha('sem-nome@exemplo.test')
    const achados = l.getAllByText('sem-nome@exemplo.test')
    expect(achados).toHaveLength(1)
    // O e-mail ocupa o lugar do nome (não só a linha de baixo, que deixaria o nome em branco).
    expect(achados[0].className).toContain('cfg__item-nome')
  })

  it('conta do robô mostra Importador (robô) e não tem ações', async () => {
    vi.mocked(listarUsuarios).mockResolvedValue([
      lista[0],
      { id: OUTRA, email: 'robo@exemplo.test', nome: 'Robô Exemplo', papel: 'importador', ativo: true, senha_provisoria: false },
    ])
    render(<Usuarios c={c} meuId={EU} />)
    const l = await linha('Robô Exemplo')
    expect(l.getByText(/Importador \(robô\)/)).toBeTruthy()
    expect(l.queryByRole('button', { name: 'Redefinir senha' })).toBeNull()
    expect(l.queryByRole('button', { name: 'Desativar' })).toBeNull()
    expect(l.queryByRole('button', { name: /Tornar/ })).toBeNull()
  })
})
