import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjetoLinha } from '../../nuvem/carteira'

vi.mock('../../nuvem/cliente', () => ({ nuvem: {} }))
vi.mock('../../nuvem/carteira', async (original) => ({
  ...(await original<typeof import('../../nuvem/carteira')>()),
  listarProjetos: vi.fn(),
  atualizarProjeto: vi.fn(),
  carregarFicha: vi.fn().mockReturnValue(new Promise(() => {})),
}))
vi.mock('../../nuvem/configuracoes', () => ({ carregarParametros: vi.fn() }))
vi.mock('../../nuvem/perfil', () => ({ listarPessoas: vi.fn() }))

import { atualizarProjeto, listarProjetos } from '../../nuvem/carteira'
import { carregarParametros } from '../../nuvem/configuracoes'
import { listarPessoas } from '../../nuvem/perfil'
import { Carteira } from './Carteira'

const HOJE = '2026-11-09'
const PARAMETROS = {
  validade_vistoria: 180, prazo_reenvio_vistoria: 7, alerta_vencimento: 30, alerta_prazo: 3,
  parado_amarelo: 7, parado_vermelho: 15, raio_mapa_km: 10,
}

function linha(p: Partial<ProjetoLinha> & { projeto: string }): ProjetoLinha {
  return {
    regional: 'SUL', origem: 'enel', municipio: 'Cidade Teste', prioridade: 5, pedido_gestor: false, pedido_gestor_em: null, pedido_gestor_por: null, qtd_defeitos: 2,
    alimentadores: ['AL-1'], etapa: 'EM ANÁLISE', etapa_desde: '2026-11-08T12:00:00+00:00', proxima_acao: null,
    prazo_proxima_acao: null, vistoria_data: null, responsavel: null,
    atualizado_em: `2026-11-09T10:00:00.${p.projeto.slice(-3)}123+00:00`, ...p,
  }
}

beforeAll(() => {
  // jsdom não calcula layout: sem tamanho, a lista virtual não desenharia nenhuma linha.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1400 })
  HTMLElement.prototype.scrollTo = () => {}
})

beforeEach(() => {
  vi.mocked(listarProjetos).mockReset()
  vi.mocked(atualizarProjeto).mockReset()
  vi.mocked(carregarParametros).mockResolvedValue(PARAMETROS)
  vi.mocked(listarPessoas).mockResolvedValue([{ id: 'p1', nome: 'Pessoa Teste', ativo: true }])
})

async function abrir(linhas: ProjetoLinha[], aoAbrir?: (p: ProjetoLinha) => void) {
  vi.mocked(listarProjetos).mockResolvedValue(linhas)
  render(<Carteira regional="SUL" hoje={HOJE} aoAbrir={aoAbrir} />)
  await screen.findByRole('table', { name: 'Carteira de projetos' })
}

describe('Carteira', () => {
  it('o seletor de etapa da linha tem o nome acessível "Etapa de <projeto>"', async () => {
    await abrir([linha({ projeto: 'EXEMPLO-001' }), linha({ projeto: 'EXEMPLO-002' })])
    expect(screen.getByRole('combobox', { name: 'Etapa de EXEMPLO-001' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Etapa de EXEMPLO-002' })).toBeTruthy()
  })

  it('trocar a etapa na linha chama atualizarProjeto com { etapa } e o atualizado_em daquela linha', async () => {
    const a = linha({ projeto: 'EXEMPLO-001' })
    const b = linha({ projeto: 'EXEMPLO-002', prioridade: 6 })
    vi.mocked(atualizarProjeto).mockResolvedValue({ ok: true, linha: { ...a, etapa: 'PROGRAMADA', atualizado_em: 'novo' } })
    await abrir([a, b])
    await userEvent.selectOptions(screen.getByLabelText('Etapa de EXEMPLO-001'), 'PROGRAMADA')
    expect(atualizarProjeto).toHaveBeenCalledWith(expect.anything(), 'EXEMPLO-001', a.atualizado_em, { etapa: 'PROGRAMADA' })
    // a linha mostra o valor na hora
    await waitFor(() => expect((screen.getByLabelText('Etapa de EXEMPLO-001') as HTMLSelectElement).value).toBe('PROGRAMADA'))
  })

  it('o seletor de etapa não oferece EXECUTADA; linha já executada mostra a etapa como texto', async () => {
    await abrir([
      linha({ projeto: 'EXEMPLO-001' }),
      linha({ projeto: 'EXEMPLO-002', etapa: 'EXECUTADA' }),
    ])
    const opcoes = within(screen.getByLabelText('Etapa de EXEMPLO-001')).getAllByRole('option').map((o) => o.textContent)
    expect(opcoes).toHaveLength(11)
    expect(opcoes).not.toContain('EXECUTADA')
    // concluídas ficam escondidas; ligando a caixa, a executada aparece sem seletor
    await userEvent.click(screen.getByLabelText('Mostrar concluídas'))
    expect(screen.queryByLabelText('Etapa de EXEMPLO-002')).toBeNull()
    expect(within(screen.getByText('EXEMPLO-002').closest('[role=row]') as HTMLElement).getByText('EXECUTADA')).toBeTruthy()
  })

  it('sem rede: a etapa volta ao valor anterior e aparece o aviso', async () => {
    vi.mocked(atualizarProjeto).mockResolvedValue({ ok: false, motivo: 'rede', mensagem: 'Não salvou: sem conexão. A mudança foi desfeita.' })
    await abrir([linha({ projeto: 'EXEMPLO-001' })])
    await userEvent.selectOptions(screen.getByLabelText('Etapa de EXEMPLO-001'), 'PROGRAMADA')
    expect(await screen.findByText('Não salvou: sem conexão. A mudança foi desfeita.')).toBeTruthy()
    expect((screen.getByLabelText('Etapa de EXEMPLO-001') as HTMLSelectElement).value).toBe('EM ANÁLISE')
  })

  it('conflito: mostra o valor novo da linha e o aviso', async () => {
    const a = linha({ projeto: 'EXEMPLO-001' })
    vi.mocked(atualizarProjeto).mockResolvedValue({
      ok: false, motivo: 'conflito', mensagem: 'Outra pessoa mudou este projeto. Recarreguei a linha.',
      atual: { ...a, etapa: 'SOLICITAR SGD', atualizado_em: 'v9' },
    })
    await abrir([a])
    await userEvent.selectOptions(screen.getByLabelText('Etapa de EXEMPLO-001'), 'PROGRAMADA')
    expect(await screen.findByText('Outra pessoa mudou este projeto. Recarreguei a linha.')).toBeTruthy()
    expect((screen.getByLabelText('Etapa de EXEMPLO-001') as HTMLSelectElement).value).toBe('SOLICITAR SGD')
  })

  it('o aviso fecha no botão', async () => {
    vi.mocked(atualizarProjeto).mockResolvedValue({ ok: false, motivo: 'rede', mensagem: 'Não salvou: sem conexão. A mudança foi desfeita.' })
    await abrir([linha({ projeto: 'EXEMPLO-001' })])
    await userEvent.selectOptions(screen.getByLabelText('Etapa de EXEMPLO-001'), 'PROGRAMADA')
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('próxima ação grava ao sair do campo, só se mudou', async () => {
    const a = linha({ projeto: 'EXEMPLO-001', proxima_acao: 'Ligar' })
    vi.mocked(atualizarProjeto).mockResolvedValue({ ok: true, linha: { ...a, proxima_acao: 'Cobrar', atualizado_em: 'v2' } })
    await abrir([a])
    const campo = screen.getByLabelText('Próxima ação de EXEMPLO-001')
    fireEvent.blur(campo)
    expect(atualizarProjeto).not.toHaveBeenCalled()
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Cobrar{Enter}')
    expect(atualizarProjeto).toHaveBeenCalledWith(expect.anything(), 'EXEMPLO-001', a.atualizado_em, { proxima_acao: 'Cobrar' })
  })

  it('Enter no campo de próxima ação grava uma vez só', async () => {
    const a = linha({ projeto: 'EXEMPLO-001' })
    vi.mocked(atualizarProjeto).mockResolvedValue({ ok: true, linha: { ...a, proxima_acao: 'Cobrar', atualizado_em: 'v2' } })
    await abrir([a])
    await userEvent.type(screen.getByLabelText('Próxima ação de EXEMPLO-001'), 'Cobrar{Enter}')
    expect(atualizarProjeto).toHaveBeenCalledTimes(1)
  })

  it('Enter no campo de prazo grava uma vez só', async () => {
    const a = linha({ projeto: 'EXEMPLO-001' })
    vi.mocked(atualizarProjeto).mockResolvedValue({ ok: true, linha: { ...a, prazo_proxima_acao: '2026-12-01', atualizado_em: 'v2' } })
    await abrir([a])
    const campo = screen.getByLabelText('Prazo de EXEMPLO-001')
    fireEvent.change(campo, { target: { value: '2026-12-01' } })
    campo.focus()
    await userEvent.keyboard('{Enter}')
    expect(atualizarProjeto).toHaveBeenCalledTimes(1)
    expect(atualizarProjeto).toHaveBeenCalledWith(expect.anything(), 'EXEMPLO-001', a.atualizado_em, { prazo_proxima_acao: '2026-12-01' })
  })

  it('Esc descarta o que foi digitado: nada é gravado', async () => {
    await abrir([linha({ projeto: 'EXEMPLO-001', proxima_acao: 'Ligar' })])
    const campo = screen.getByLabelText('Próxima ação de EXEMPLO-001') as HTMLInputElement
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Cobrar{Escape}')
    expect(atualizarProjeto).not.toHaveBeenCalled()
    expect(campo.value).toBe('Ligar')
  })

  it('conflito ao dar Enter: nada é gravado por cima do colega, o valor dele aparece e o aviso fica', async () => {
    const a = linha({ projeto: 'EXEMPLO-001' })
    vi.mocked(atualizarProjeto).mockResolvedValue({
      ok: false, motivo: 'conflito', mensagem: 'Outra pessoa mudou este projeto. Recarreguei a linha.',
      atual: { ...a, proxima_acao: 'Valor do colega', atualizado_em: 'v9' },
    })
    await abrir([a])
    await userEvent.type(screen.getByLabelText('Próxima ação de EXEMPLO-001'), 'Cobrar{Enter}')
    expect(await screen.findByText('Outra pessoa mudou este projeto. Recarreguei a linha.')).toBeTruthy()
    expect(atualizarProjeto).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('Próxima ação de EXEMPLO-001') as HTMLInputElement).value).toBe('Valor do colega')
  })

  it('a linha mostra "Salvando" enquanto a gravação está no ar e para de mostrar depois', async () => {
    const a = linha({ projeto: 'EXEMPLO-001' })
    let solta!: (r: Awaited<ReturnType<typeof atualizarProjeto>>) => void
    vi.mocked(atualizarProjeto).mockImplementation(() => new Promise((r) => { solta = r }))
    await abrir([a])
    expect(screen.queryByText('Salvando')).toBeNull()
    await userEvent.selectOptions(screen.getByLabelText('Etapa de EXEMPLO-001'), 'PROGRAMADA')
    expect(screen.getByText('Salvando')).toBeTruthy()
    solta({ ok: true, linha: { ...a, etapa: 'PROGRAMADA', atualizado_em: 'v2' } })
    await waitFor(() => expect(screen.queryByText('Salvando')).toBeNull())
  })

  it('o nível do tempo parado vem escrito, não só em cor', async () => {
    await abrir([
      linha({ projeto: 'EXEMPLO-001', etapa_desde: '2026-10-30T12:00:00+00:00' }),
      linha({ projeto: 'EXEMPLO-002', prioridade: 6, etapa_desde: '2026-10-20T12:00:00+00:00' }),
    ])
    expect(screen.getByText('atenção')).toBeTruthy()
    expect(screen.getByText('crítico')).toBeTruthy()
  })

  it('atalhos filtram e mostram a contagem; atrasada traz o aviso escrito', async () => {
    await abrir([
      linha({ projeto: 'EXEMPLO-001', etapa: 'AGUARDANDO VISTORIA', prazo_proxima_acao: '2026-11-08' }),
      linha({ projeto: 'EXEMPLO-002', etapa: 'PROGRAMADA' }),
    ])
    expect(screen.getByRole('button', { name: /^Atrasadas\s*1$/ })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /^Programadas/ }))
    expect(screen.queryByText('EXEMPLO-001')).toBeNull()
    expect(screen.getByText('EXEMPLO-002')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /^Atrasadas/ }))
    expect(screen.getByText('EXEMPLO-001')).toBeTruthy()
    expect(screen.getByText('Atrasada')).toBeTruthy()
  })

  it('busca sem acento e sem caixa acha o município', async () => {
    await abrir([
      linha({ projeto: 'EXEMPLO-001', municipio: 'Icó' }),
      linha({ projeto: 'EXEMPLO-002', municipio: 'Crato' }),
    ])
    await userEvent.type(screen.getByLabelText('Buscar na carteira'), 'ICO')
    expect(screen.getByText('EXEMPLO-001')).toBeTruthy()
    expect(screen.queryByText('EXEMPLO-002')).toBeNull()
  })

  it('mostra vistoria e dias parado por escrito', async () => {
    await abrir([
      linha({ projeto: 'EXEMPLO-001', vistoria_data: '2026-01-01', etapa_desde: '2026-10-20T12:00:00+00:00' }),
    ])
    const l = screen.getByText('EXEMPLO-001').closest('[role=row]') as HTMLElement
    expect(within(l).getByText(/^Vencida há \d+ d$/)).toBeTruthy()
    expect(within(l).getByText('20 d')).toBeTruthy()
  })

  it('teclado: setas trocam de linha e Enter abre a ficha da linha em foco', async () => {
    const aoAbrir = vi.fn()
    await abrir([
      linha({ projeto: 'EXEMPLO-001', prioridade: 1 }),
      linha({ projeto: 'EXEMPLO-002', prioridade: 2 }),
      linha({ projeto: 'EXEMPLO-003', prioridade: 3 }),
    ], aoAbrir)
    const linhas = () => screen.getAllByRole('row').slice(1)
    linhas()[0].focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await waitFor(() => expect(document.activeElement).toBe(linhas()[2]))
    await userEvent.keyboard('{ArrowUp}')
    await waitFor(() => expect(document.activeElement).toBe(linhas()[1]))
    await userEvent.keyboard('{Enter}')
    expect(aoAbrir).toHaveBeenCalledWith(expect.objectContaining({ projeto: 'EXEMPLO-002' }))
  })

  it('Enter dentro de um campo não abre a ficha', async () => {
    const aoAbrir = vi.fn()
    await abrir([linha({ projeto: 'EXEMPLO-001' })], aoAbrir)
    screen.getByLabelText('Próxima ação de EXEMPLO-001').focus()
    await userEvent.keyboard('{Enter}')
    expect(aoAbrir).not.toHaveBeenCalled()
  })

  it('só desenha as linhas da janela, não as milhares', async () => {
    await abrir(Array.from({ length: 3000 }, (_, i) => linha({ projeto: `EXEMPLO-${String(i).padStart(4, '0')}` })))
    expect(screen.getAllByRole('row').length).toBeLessThan(60)
    expect(screen.getByText('3000 projetos')).toBeTruthy()
  })

  it('carteira vazia explica de onde os projetos vêm', async () => {
    vi.mocked(listarProjetos).mockResolvedValue([])
    render(<Carteira regional="SUL" hoje={HOJE} />)
    expect(await screen.findByText(/importação da Enel/)).toBeTruthy()
  })
})
