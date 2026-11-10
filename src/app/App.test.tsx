import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../nuvem/cliente', () => ({ nuvem: null }))

import { App } from './App'

describe('App', () => {
  it('sem sessão mostra a tela de entrada com a marca', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: /entrar/i })).toBeTruthy()
    expect(screen.getAllByLabelText('PMRD').length).toBeGreaterThan(0)
  })
})
