import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../nuvem/configuracoes', () => ({
  listarEquipes: vi.fn(),
  salvarEquipe: vi.fn(),
}))

import { listarEquipes, salvarEquipe } from '../../nuvem/configuracoes'
import { Equipes } from './Equipes'

const c = {} as SupabaseClient

beforeEach(() => {
  vi.mocked(listarEquipes).mockReset().mockResolvedValue([])
  vi.mocked(salvarEquipe).mockReset().mockResolvedValue(undefined)
})

describe('Equipes', () => {
  it('o título do formulário vem logo abaixo do título da tela (nível 2, sem pular nível)', async () => {
    render(<Equipes c={c} />)
    await screen.findByText('Nenhuma equipe cadastrada ainda.')
    expect(screen.getByRole('heading', { name: 'Nova equipe', level: 2 })).toBeTruthy()
  })

  it('o LID preenche a base e o grupo sugerido, e o admin pode trocar o grupo', async () => {
    render(<Equipes c={c} />)
    await screen.findByText('Nenhuma equipe cadastrada ainda.')
    await userEvent.type(screen.getByLabelText('LID'), 'JZN-ML-99X')
    expect((screen.getByLabelText('Base') as HTMLInputElement).value).toBe('JZN')
    const grupo = screen.getByLabelText('Grupo do Report') as HTMLInputElement
    expect(grupo.value).toBe('ML Juazeiro')

    await userEvent.clear(grupo)
    await userEvent.type(grupo, 'Grupo Escolhido')
    // Depois de editado à mão, mudar o tipo não sobrescreve o grupo.
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'MP')
    expect(grupo.value).toBe('Grupo Escolhido')
  })

  it('o grupo acompanha o tipo enquanto não foi editado à mão', async () => {
    render(<Equipes c={c} />)
    await screen.findByText('Nenhuma equipe cadastrada ainda.')
    await userEvent.type(screen.getByLabelText('LID'), 'JZN-ML-99X')
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'LV')
    expect((screen.getByLabelText('Grupo do Report') as HTMLInputElement).value).toBe('Linha Viva')
  })

  it('salvar sem chefe mostra o aviso e não grava', async () => {
    render(<Equipes c={c} />)
    await screen.findByText('Nenhuma equipe cadastrada ainda.')
    await userEvent.type(screen.getByLabelText('LID'), 'JZN-ML-99X')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar equipe' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Falta o chefe de turma.')
    expect(salvarEquipe).not.toHaveBeenCalled()
  })

  it('salva a equipe com base e grupo e recarrega a lista', async () => {
    render(<Equipes c={c} />)
    await screen.findByText('Nenhuma equipe cadastrada ainda.')
    await userEvent.type(screen.getByLabelText('LID'), 'JZN-ML-99X')
    await userEvent.type(screen.getByLabelText('Chefe de turma'), 'Pessoa Exemplo')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar equipe' }))
    expect(salvarEquipe).toHaveBeenCalledWith(c, expect.objectContaining({
      lid: 'JZN-ML-99X', chefe: 'Pessoa Exemplo', tipo: 'ML', base: 'JZN', grupo_report: 'ML Juazeiro', ativa: true,
    }))
    await vi.waitFor(() => expect(vi.mocked(listarEquipes).mock.calls.length).toBeGreaterThan(1))
  })

  it('LID repetido mostra o aviso e não grava por cima da equipe existente', async () => {
    vi.mocked(listarEquipes).mockResolvedValue([{
      lid: 'JZN-ML-99X', chefe: 'Pessoa Exemplo', tipo: 'ML', regional: 'CS', grupo_report: 'ML Juazeiro',
      base: 'JZN', ativa: true, foto_path: 'exemplo/foto.jpg',
    }])
    render(<Equipes c={c} />)
    await screen.findByText('Pessoa Exemplo')
    await userEvent.type(screen.getByLabelText('LID'), '  jzn-ml-99x ')
    await userEvent.type(screen.getByLabelText('Chefe de turma'), 'Outra Pessoa')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar equipe' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Esse LID já existe. Use Editar.')
    expect(salvarEquipe).not.toHaveBeenCalled()
  })
})
