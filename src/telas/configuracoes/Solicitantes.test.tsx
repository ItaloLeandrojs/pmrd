import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../nuvem/configuracoes', () => ({
  listarSolicitantes: vi.fn(),
  novoSolicitante: vi.fn(),
  salvarSolicitante: vi.fn(),
}))

import { listarSolicitantes, novoSolicitante } from '../../nuvem/configuracoes'
import { Solicitantes } from './Solicitantes'

const c = {} as SupabaseClient

beforeEach(() => {
  vi.mocked(listarSolicitantes).mockReset().mockResolvedValue([])
  vi.mocked(novoSolicitante).mockReset()
})

describe('Solicitantes', () => {
  it('duplo clique em Acrescentar grava uma vez só e mostra "Salvando..."', async () => {
    let soltar: () => void = () => {}
    vi.mocked(novoSolicitante).mockReturnValue(new Promise<void>((ok) => { soltar = ok }))
    render(<Solicitantes c={c} />)
    await screen.findByText('Nenhum solicitante cadastrado ainda.')
    await userEvent.type(screen.getByLabelText('Nome do solicitante'), 'EXEMPLO')
    const botao = screen.getByRole('button', { name: 'Acrescentar' })
    await userEvent.dblClick(botao)
    expect(novoSolicitante).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Salvando...' })).toBeTruthy()
    soltar()
    await screen.findByRole('button', { name: 'Acrescentar' })
  })
})
