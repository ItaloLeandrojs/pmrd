import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../nuvem/cliente', () => ({ nuvem: null }))
vi.mock('../nuvem/sessao', () => ({ useSessao: vi.fn() }))

import { useSessao } from '../nuvem/sessao'
import { App } from './App'

const parado = { entrar: vi.fn(), sair: vi.fn(), trocarSenha: vi.fn() }

beforeEach(() => {
  vi.mocked(useSessao).mockReset()
})

describe('App', () => {
  it('sem sessão mostra a tela de entrada com a marca', async () => {
    vi.mocked(useSessao).mockReturnValue({ ...parado, estado: 'fora', perfil: null })
    render(<App />)
    expect(await screen.findByRole('button', { name: /entrar/i })).toBeTruthy()
    expect(screen.getAllByLabelText('PMRD').length).toBeGreaterThan(0)
  })

  it('conta do importador vê que não usa o site e só tem o botão Sair', async () => {
    const sair = vi.fn()
    vi.mocked(useSessao).mockReturnValue({
      ...parado,
      sair,
      estado: 'dentro',
      perfil: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'robo@exemplo.test',
        nome: '',
        papel: 'importador',
        ativo: true,
        senha_provisoria: true,
        regional_preferida: 'TODAS',
        tema: 'sistema',
      },
    })
    render(<App />)
    expect(await screen.findByText('Esta conta não usa o site.')).toBeTruthy()
    screen.getByRole('button', { name: 'Sair' }).click()
    expect(sair).toHaveBeenCalled()
  })
})
