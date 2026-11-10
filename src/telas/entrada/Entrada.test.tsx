import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// A tela nunca chama o Supabase de verdade.
vi.mock('../../nuvem/cliente', () => ({ nuvem: null }))

import { Entrada } from './Entrada'

describe('Entrada', () => {
  it('a página tem um título de nível 1 (leitor de tela)', () => {
    render(<Entrada entrar={vi.fn()} />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('Enter no formulário chama entrar uma vez com e-mail e senha', async () => {
    const entrar = vi.fn().mockResolvedValue(null)
    render(<Entrada entrar={entrar} />)
    await userEvent.type(screen.getByLabelText('E-mail'), 'pessoa@exemplo.test')
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo123{Enter}')
    expect(entrar).toHaveBeenCalledTimes(1)
    expect(entrar).toHaveBeenCalledWith('pessoa@exemplo.test', 'segredo123')
  })

  it('mostra o erro em role="alert"', async () => {
    const entrar = vi.fn().mockResolvedValue('E-mail ou senha não conferem.')
    render(<Entrada entrar={entrar} />)
    await userEvent.type(screen.getByLabelText('E-mail'), 'a@exemplo.test')
    await userEvent.type(screen.getByLabelText('Senha'), 'errada{Enter}')
    expect((await screen.findByRole('alert')).textContent).toContain('E-mail ou senha não conferem.')
  })

  it('não chama entrar com campos vazios', async () => {
    const entrar = vi.fn()
    render(<Entrada entrar={entrar} />)
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }))
    expect(entrar).not.toHaveBeenCalled()
  })

  it('o botão do olho mostra e esconde a senha', async () => {
    render(<Entrada entrar={vi.fn()} />)
    const campo = screen.getByLabelText('Senha') as HTMLInputElement
    expect(campo.type).toBe('password')
    await userEvent.click(screen.getByRole('button', { name: /mostrar senha/i }))
    expect(campo.type).toBe('text')
  })

  it('mostra "Esqueceu a senha? Peça ao administrador" sem ser link', () => {
    render(<Entrada entrar={vi.fn()} />)
    const aviso = screen.getByText('Esqueceu a senha? Peça ao administrador')
    expect(aviso).toBeTruthy()
    expect(aviso.closest('a')).toBeNull()
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull()
  })
})
