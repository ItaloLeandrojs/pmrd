import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Perfil } from '../nuvem/perfil'

const guardar = vi.fn(async () => undefined)
vi.mock('../nuvem/cliente', () => ({ nuvem: {} }))
vi.mock('../nuvem/perfil', () => ({ guardarPreferencias: (...a: unknown[]) => guardar(...(a as [])) }))

import { Casca } from './Casca'

const perfil = (o: Partial<Perfil> = {}): Perfil => ({
  id: 'u1', email: 'a@exemplo.test', nome: 'Pessoa Exemplo', papel: 'admin', ativo: true,
  senha_provisoria: false, regional_preferida: 'CS', tema: 'claro', ...o,
})

beforeEach(() => {
  guardar.mockClear()
  document.documentElement.removeAttribute('data-tema')
  window.location.hash = ''
  try { localStorage.clear() } catch { /* sem armazenamento */ }
})

describe('Casca', () => {
  it('clicar em Sul guarda a regional com o tema atual', () => {
    render(<Casca perfil={perfil()} telas={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sul' }))
    expect(guardar).toHaveBeenCalledWith(expect.anything(), 'SUL', 'claro')
    expect(screen.getByRole('button', { name: 'Sul' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('o botão de tema alterna claro e escuro, põe data-tema e guarda', () => {
    render(<Casca perfil={perfil({ regional_preferida: 'LESTE' })} telas={{}} />)
    expect(document.documentElement.getAttribute('data-tema')).toBe('claro')
    fireEvent.click(screen.getByRole('button', { name: /tema/i }))
    expect(document.documentElement.getAttribute('data-tema')).toBe('escuro')
    expect(guardar).toHaveBeenLastCalledWith(expect.anything(), 'LESTE', 'escuro')
    fireEvent.click(screen.getByRole('button', { name: /tema/i }))
    expect(document.documentElement.getAttribute('data-tema')).toBe('claro')
  })

  it('na Agenda, Todas fica desligada com aria-disabled e não troca', () => {
    window.location.hash = '#/agenda'
    render(<Casca perfil={perfil({ regional_preferida: 'SUL' })} telas={{}} />)
    const todas = screen.getByRole('button', { name: /todas/i })
    expect(todas.getAttribute('aria-disabled')).toBe('true')
    expect(todas.hasAttribute('disabled')).toBe(false)
    fireEvent.click(todas)
    expect(guardar).not.toHaveBeenCalled()
  })

  it('menu: aria-current na tela ativa; equipe não vê Configurações', () => {
    window.location.hash = '#/carteira'
    render(<Casca perfil={perfil({ papel: 'equipe' })} telas={{}} />)
    expect(screen.getByRole('link', { name: 'Carteira' }).getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('link', { name: 'Configurações' })).toBeNull()
  })

  it('tela sem componente mostra o plano em que chega', () => {
    window.location.hash = '#/mapa'
    render(<Casca perfil={perfil()} telas={{}} />)
    expect(screen.getByText('Esta tela chega no plano 4.')).toBeTruthy()
  })

  it('tela registrada recebe a regional efetiva', () => {
    window.location.hash = '#/agenda'
    const Agenda = ({ regional }: { regional: string }) => <p>agenda {regional}</p>
    render(<Casca perfil={perfil({ regional_preferida: 'TODAS' })} telas={{ agenda: Agenda }} />)
    expect(screen.getByText('agenda CS')).toBeTruthy()
  })

  it('Sair chama aoSair', () => {
    const aoSair = vi.fn()
    render(<Casca perfil={perfil()} telas={{}} aoSair={aoSair} />)
    fireEvent.click(screen.getByRole('button', { name: /sair/i }))
    expect(aoSair).toHaveBeenCalled()
  })
})
