import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../nuvem/cliente', () => ({ nuvem: null }))

import { NovaSenha } from './NovaSenha'

async function preencher(nova: string, repetir: string) {
  await userEvent.type(screen.getByLabelText('Nova senha'), nova)
  await userEvent.type(screen.getByLabelText('Repita a nova senha'), repetir)
  await userEvent.click(screen.getByRole('button', { name: /salvar/i }))
}

describe('NovaSenha', () => {
  it('recusa senha de 7 caracteres', async () => {
    const trocar = vi.fn()
    render(<NovaSenha trocarSenha={trocar} sair={vi.fn()} />)
    await preencher('1234567', '1234567')
    expect((await screen.findByRole('alert')).textContent).toContain('A senha precisa de pelo menos 8 caracteres.')
    expect(trocar).not.toHaveBeenCalled()
  })

  it('recusa senhas diferentes', async () => {
    const trocar = vi.fn()
    render(<NovaSenha trocarSenha={trocar} sair={vi.fn()} />)
    await preencher('12345678', '12345679')
    expect((await screen.findByRole('alert')).textContent).toContain('As duas senhas não são iguais.')
    expect(trocar).not.toHaveBeenCalled()
  })

  it('com tudo certo chama trocarSenha com a nova senha', async () => {
    const trocar = vi.fn().mockResolvedValue(null)
    render(<NovaSenha trocarSenha={trocar} sair={vi.fn()} />)
    await preencher('12345678', '12345678')
    expect(trocar).toHaveBeenCalledTimes(1)
    expect(trocar).toHaveBeenCalledWith('12345678')
  })

  it('mostra o erro devolvido pelo servidor', async () => {
    const trocar = vi.fn().mockResolvedValue('Sem conexão com o servidor. Confira a internet ou a VPN.')
    render(<NovaSenha trocarSenha={trocar} sair={vi.fn()} />)
    await preencher('12345678', '12345678')
    expect((await screen.findByRole('alert')).textContent).toContain('Sem conexão')
  })

  it('permite sair sem trocar', async () => {
    const sair = vi.fn()
    render(<NovaSenha trocarSenha={vi.fn()} sair={sair} />)
    await userEvent.click(screen.getByRole('button', { name: /sair/i }))
    expect(sair).toHaveBeenCalledTimes(1)
  })
})
