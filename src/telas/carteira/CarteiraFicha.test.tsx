// Ficha ao lado da tabela, pedido do gestor e projeto novo à mão, dentro da Carteira.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FichaProjeto, ProjetoLinha } from '../../nuvem/carteira'

vi.mock('../../nuvem/cliente', () => ({ nuvem: {} }))
vi.mock('../../nuvem/carteira', async (original) => ({
  ...(await original<typeof import('../../nuvem/carteira')>()),
  listarProjetos: vi.fn(),
  atualizarProjeto: vi.fn(),
  carregarFicha: vi.fn(),
  criarProjetoManual: vi.fn(),
}))
vi.mock('../../nuvem/configuracoes', () => ({ carregarParametros: vi.fn() }))
vi.mock('../../nuvem/perfil', () => ({ listarPessoas: vi.fn() }))

import { atualizarProjeto, carregarFicha, criarProjetoManual, listarProjetos } from '../../nuvem/carteira'
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
    regional: 'SUL', origem: 'enel', municipio: 'Cidade Teste', prioridade: 5, pedido_gestor: false,
    pedido_gestor_em: null, pedido_gestor_por: null, qtd_defeitos: 2,
    alimentadores: ['AL-1'], etapa: 'EM ANÁLISE', etapa_desde: '2026-11-08T12:00:00+00:00', proxima_acao: null,
    prazo_proxima_acao: null, vistoria_data: null, responsavel: null,
    atualizado_em: `2026-11-09T10:00:00.${p.projeto.slice(-3)}123+00:00`, ...p,
  }
}

function fichaDe(l: ProjetoLinha): FichaProjeto {
  return {
    projeto: {
      ...l, ot_correcao: null, endereco: null, elemento_corte: null, qtd_clientes: null, estruturas: [],
      intervencao_prevista: null, vistoria_situacao: null, vistoria_recurso: null, vistoria_intervencao: null,
      vistoria_observacao: null, vistoria_enviada_em: null, saiu_da_demanda: false,
    },
    defeitos: [],
    historico: [],
  }
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1400 })
  HTMLElement.prototype.scrollTo = () => {}
})

beforeEach(() => {
  vi.mocked(listarProjetos).mockReset()
  vi.mocked(atualizarProjeto).mockReset()
  vi.mocked(criarProjetoManual).mockReset()
  vi.mocked(carregarFicha).mockReset()
  vi.mocked(carregarFicha).mockImplementation(async (_c, projeto) => fichaDe(linha({ projeto })))
  vi.mocked(carregarParametros).mockResolvedValue(PARAMETROS)
  vi.mocked(listarPessoas).mockResolvedValue([{ id: 'p1', nome: 'Pessoa Teste', ativo: true }])
})

async function abrir(linhas: ProjetoLinha[], aoAbrir?: (p: ProjetoLinha) => void) {
  vi.mocked(listarProjetos).mockResolvedValue(linhas)
  render(<Carteira regional="SUL" hoje={HOJE} aoAbrir={aoAbrir} />)
  await screen.findByRole('table', { name: 'Carteira de projetos' })
}

const tres = () => [
  linha({ projeto: 'EXEMPLO-001', prioridade: 1 }),
  linha({ projeto: 'EXEMPLO-002', prioridade: 2 }),
  linha({ projeto: 'EXEMPLO-003', prioridade: 3 }),
]

describe('Ficha ao lado da tabela', () => {
  it('Enter na linha abre a ficha num painel ao lado; a tabela continua na tela e esconde Alimentador e Vistoria', async () => {
    await abrir(tres())
    expect(screen.getByRole('columnheader', { name: 'Alimentador' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Vistoria' })).toBeTruthy()
    screen.getAllByRole('row')[2].focus()
    await userEvent.keyboard('{Enter}')
    const painel = await screen.findByRole('complementary', { name: 'Ficha do projeto EXEMPLO-002' })
    expect(await within(painel).findByRole('heading', { name: 'Dados' })).toBeTruthy()
    expect(carregarFicha).toHaveBeenCalledWith(expect.anything(), 'EXEMPLO-002')
    expect(screen.getByRole('table', { name: 'Carteira de projetos' })).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: 'Alimentador' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Vistoria' })).toBeNull()
    expect(within(screen.getByRole('table')).queryByText('Sem vistoria')).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Etapa' })).toBeTruthy()
  })

  it('clicar no nome do projeto também abre a ficha', async () => {
    await abrir(tres())
    await userEvent.click(screen.getByText('EXEMPLO-003'))
    expect(await screen.findByRole('complementary', { name: 'Ficha do projeto EXEMPLO-003' })).toBeTruthy()
  })

  it('Esc fecha a ficha, devolve o foco para a linha e as colunas voltam', async () => {
    await abrir(tres())
    screen.getAllByRole('row')[2].focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('complementary', { name: 'Ficha do projeto EXEMPLO-002' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull())
    await waitFor(() => expect((document.activeElement as HTMLElement).dataset.projeto).toBe('EXEMPLO-002'))
    expect(screen.getByRole('columnheader', { name: 'Alimentador' })).toBeTruthy()
  })

  it('Esc dentro de um campo da linha só descarta o campo: a ficha continua aberta', async () => {
    await abrir(tres())
    await userEvent.click(screen.getByText('EXEMPLO-001'))
    await screen.findByRole('complementary')
    await userEvent.type(screen.getByLabelText('Próxima ação de EXEMPLO-002'), 'abc{Escape}')
    expect(screen.getByRole('complementary')).toBeTruthy()
  })

  it('o botão Fechar da ficha também fecha e devolve o foco à linha', async () => {
    await abrir(tres())
    await userEvent.click(screen.getByText('EXEMPLO-001'))
    await userEvent.click(await screen.findByRole('button', { name: 'Fechar ficha' }))
    expect(screen.queryByRole('complementary')).toBeNull()
    await waitFor(() => expect((document.activeElement as HTMLElement).dataset.projeto).toBe('EXEMPLO-001'))
  })

  it('o aoAbrir de fora continua sendo chamado', async () => {
    const aoAbrir = vi.fn()
    await abrir(tres(), aoAbrir)
    screen.getAllByRole('row')[1].focus()
    await userEvent.keyboard('{Enter}')
    expect(aoAbrir).toHaveBeenCalledWith(expect.objectContaining({ projeto: 'EXEMPLO-001' }))
  })
})

describe('Pedido do gestor', () => {
  it('marcar pede a data (hoje por padrão) e quem pediu, e grava os três campos numa gravação só', async () => {
    const a = linha({ projeto: 'EXEMPLO-001' })
    vi.mocked(atualizarProjeto).mockResolvedValue({ ok: true, linha: { ...a, pedido_gestor: true, atualizado_em: 'v2' } })
    await abrir([a])
    await userEvent.click(screen.getByRole('button', { name: 'Pedido do gestor de EXEMPLO-001' }))
    const d = await screen.findByRole('dialog', { name: 'Pedido do gestor de EXEMPLO-001' })
    expect(atualizarProjeto).not.toHaveBeenCalled()
    expect((within(d).getByLabelText('Data do pedido') as HTMLInputElement).value).toBe(HOJE)
    await userEvent.type(within(d).getByLabelText('Quem pediu'), 'Gestor Teste')
    await userEvent.click(within(d).getByRole('button', { name: 'Marcar pedido' }))
    expect(atualizarProjeto).toHaveBeenCalledTimes(1)
    expect(atualizarProjeto).toHaveBeenCalledWith(expect.anything(), 'EXEMPLO-001', a.atualizado_em, {
      pedido_gestor: true, pedido_gestor_em: HOJE, pedido_gestor_por: 'Gestor Teste',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Pedido do gestor de EXEMPLO-001' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('sem dizer quem pediu não grava e avisa', async () => {
    await abrir([linha({ projeto: 'EXEMPLO-001' })])
    await userEvent.click(screen.getByRole('button', { name: 'Pedido do gestor de EXEMPLO-001' }))
    const d = await screen.findByRole('dialog')
    await userEvent.click(within(d).getByRole('button', { name: 'Marcar pedido' }))
    expect(within(d).getByText('Diga quem pediu o projeto.')).toBeTruthy()
    expect(atualizarProjeto).not.toHaveBeenCalled()
  })

  it('Esc fecha o pedido sem gravar, e a ficha atrás continua aberta', async () => {
    await abrir([linha({ projeto: 'EXEMPLO-001' })])
    await userEvent.click(screen.getByText('EXEMPLO-001'))
    await screen.findByRole('complementary')
    await userEvent.click(screen.getByRole('button', { name: 'Pedido do gestor de EXEMPLO-001' }))
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('complementary')).toBeTruthy()
    expect(atualizarProjeto).not.toHaveBeenCalled()
  })

  it('desmarcar limpa os três campos numa gravação só, sem perguntar', async () => {
    const a = linha({ projeto: 'EXEMPLO-001', pedido_gestor: true, pedido_gestor_em: '2026-11-05', pedido_gestor_por: 'Gestor Teste' })
    vi.mocked(atualizarProjeto).mockResolvedValue({ ok: true, linha: { ...a, pedido_gestor: false, pedido_gestor_em: null, pedido_gestor_por: null, atualizado_em: 'v2' } })
    await abrir([a])
    await userEvent.click(screen.getByRole('button', { name: 'Pedido do gestor de EXEMPLO-001' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(atualizarProjeto).toHaveBeenCalledWith(expect.anything(), 'EXEMPLO-001', a.atualizado_em, {
      pedido_gestor: false, pedido_gestor_em: null, pedido_gestor_por: null,
    })
  })

  it('conflito ao marcar: vale a linha do colega e o aviso aparece', async () => {
    const a = linha({ projeto: 'EXEMPLO-001' })
    vi.mocked(atualizarProjeto).mockResolvedValue({
      ok: false, motivo: 'conflito', mensagem: 'Outra pessoa mudou este projeto. Recarreguei a linha.', atual: { ...a, etapa: 'SOLICITAR SGD', atualizado_em: 'v9' },
    })
    await abrir([a])
    await userEvent.click(screen.getByRole('button', { name: 'Pedido do gestor de EXEMPLO-001' }))
    const d = await screen.findByRole('dialog')
    await userEvent.type(within(d).getByLabelText('Quem pediu'), 'Gestor Teste')
    await userEvent.click(within(d).getByRole('button', { name: 'Marcar pedido' }))
    expect(await screen.findByText('Outra pessoa mudou este projeto. Recarreguei a linha.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pedido do gestor de EXEMPLO-001' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('pela ficha: "Editar o pedido do gestor" abre o mesmo quadro já preenchido', async () => {
    const a = linha({ projeto: 'EXEMPLO-001', pedido_gestor: true, pedido_gestor_em: '2026-11-05', pedido_gestor_por: 'Gestor Teste' })
    vi.mocked(carregarFicha).mockResolvedValue(fichaDe(a))
    vi.mocked(atualizarProjeto).mockResolvedValue({ ok: true, linha: { ...a, atualizado_em: 'v2' } })
    await abrir([a])
    await userEvent.click(screen.getByText('EXEMPLO-001'))
    await userEvent.click(await screen.findByRole('button', { name: 'Editar o pedido do gestor' }))
    const d = await screen.findByRole('dialog')
    expect((within(d).getByLabelText('Data do pedido') as HTMLInputElement).value).toBe('2026-11-05')
    const quem = within(d).getByLabelText('Quem pediu') as HTMLInputElement
    expect(quem.value).toBe('Gestor Teste')
    await userEvent.clear(quem)
    await userEvent.type(quem, 'Outro Gestor')
    await userEvent.click(within(d).getByRole('button', { name: 'Marcar pedido' }))
    expect(atualizarProjeto).toHaveBeenCalledWith(expect.anything(), 'EXEMPLO-001', a.atualizado_em, {
      pedido_gestor: true, pedido_gestor_em: '2026-11-05', pedido_gestor_por: 'Outro Gestor',
    })
  })
})

describe('Novo projeto', () => {
  async function abrirForm(regional: 'SUL' | 'TODAS' = 'SUL') {
    vi.mocked(listarProjetos).mockResolvedValue([linha({ projeto: 'RESU260001' })])
    render(<Carteira regional={regional} hoje={HOJE} />)
    await screen.findByRole('table', { name: 'Carteira de projetos' })
    await userEvent.click(screen.getByRole('button', { name: 'Novo projeto' }))
    return await screen.findByRole('dialog', { name: 'Novo projeto' })
  }

  it('valida na tela: projeto que já está na carteira (mesmo em minúsculas) não grava', async () => {
    const d = await abrirForm()
    await userEvent.type(within(d).getByLabelText('Projeto'), ' resu260001 ')
    await userEvent.type(within(d).getByLabelText('Município'), 'Cidade Teste')
    await userEvent.type(within(d).getByLabelText('Quantidade de defeitos'), '3')
    await userEvent.click(within(d).getByRole('button', { name: 'Criar projeto' }))
    expect(within(d).getByText('Este projeto já está na carteira.')).toBeTruthy()
    expect(criarProjetoManual).not.toHaveBeenCalled()
  })

  it('cria com ID GOM (um por linha), fecha e recarrega a carteira', async () => {
    vi.mocked(criarProjetoManual).mockResolvedValue({ ok: true })
    const d = await abrirForm()
    await userEvent.type(within(d).getByLabelText('Projeto'), 'RESU260002')
    await userEvent.type(within(d).getByLabelText('Município'), 'Cidade Teste')
    await userEvent.selectOptions(within(d).getByLabelText('Prioridade'), '5')
    await userEvent.type(within(d).getByLabelText('ID GOM (um por linha)'), 'G-1{Enter}G-2{Enter}')
    await userEvent.click(within(d).getByRole('button', { name: 'Criar projeto' }))
    expect(criarProjetoManual).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      projeto: 'RESU260002', regional: 'SUL', municipio: 'Cidade Teste', prioridade: 5, ids_gom: ['G-1', 'G-2'],
    }))
    await waitFor(() => expect(listarProjetos).toHaveBeenCalledTimes(2))
  })

  it('sem ID GOM pede a quantidade de defeitos', async () => {
    const d = await abrirForm()
    await userEvent.type(within(d).getByLabelText('Projeto'), 'RESU260002')
    await userEvent.type(within(d).getByLabelText('Município'), 'Cidade Teste')
    await userEvent.click(within(d).getByRole('button', { name: 'Criar projeto' }))
    expect(within(d).getByText('Informe os ID GOM ou a quantidade de defeitos.')).toBeTruthy()
    await userEvent.type(within(d).getByLabelText('Quantidade de defeitos'), '22')
    vi.mocked(criarProjetoManual).mockResolvedValue({ ok: true })
    await userEvent.click(within(d).getByRole('button', { name: 'Criar projeto' }))
    expect(criarProjetoManual).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ qtd_defeitos: 22 }))
  })

  it('erro do banco fica no quadro, que continua aberto', async () => {
    vi.mocked(criarProjetoManual).mockResolvedValue({ ok: false, erro: 'Não salvou: sem conexão. Confira a internet ou a VPN.' })
    const d = await abrirForm()
    await userEvent.type(within(d).getByLabelText('Projeto'), 'RESU260002')
    await userEvent.type(within(d).getByLabelText('Município'), 'Cidade Teste')
    await userEvent.type(within(d).getByLabelText('Quantidade de defeitos'), '2')
    await userEvent.click(within(d).getByRole('button', { name: 'Criar projeto' }))
    expect(await within(d).findByText(/sem conexão/)).toBeTruthy()
    expect(listarProjetos).toHaveBeenCalledTimes(1)
  })

  it('projeto entrou sem os ID GOM: mostra o aviso e, ao fechar, recarrega a carteira', async () => {
    vi.mocked(criarProjetoManual).mockResolvedValue({ ok: false, projetoCriado: true, erro: 'O projeto entrou, mas sem os ID GOM: algum já existe em outro projeto.' })
    const d = await abrirForm()
    await userEvent.type(within(d).getByLabelText('Projeto'), 'RESU260002')
    await userEvent.type(within(d).getByLabelText('Município'), 'Cidade Teste')
    await userEvent.type(within(d).getByLabelText('ID GOM (um por linha)'), 'G-1')
    await userEvent.click(within(d).getByRole('button', { name: 'Criar projeto' }))
    expect(await within(d).findByText(/O projeto entrou, mas sem os ID GOM/)).toBeTruthy()
    expect(within(d).getByText(/entrou com a quantidade de defeitos informada/)).toBeTruthy()
    expect(within(d).queryByText(/cadastrados de novo/)).toBeNull()
    await userEvent.click(within(d).getByRole('button', { name: 'Fechar e atualizar a carteira' }))
    await waitFor(() => expect(listarProjetos).toHaveBeenCalledTimes(2))
  })

  it.each(['SUL', 'TODAS'] as const)('Tab percorre o quadro na ordem da tela, do Projeto ao Regional e ao resto (regional %s)', async (regional) => {
    const d = await abrirForm(regional)
    const q = within(d)
    expect(document.activeElement).toBe(q.getByLabelText('Projeto'))
    const ordem = ['Regional', 'Município', 'Prioridade', 'OT de correção', 'Intervenção prevista', 'Endereço', 'ID GOM (um por linha)', 'Quantidade de defeitos']
    for (const rotulo of ordem) {
      await userEvent.tab()
      expect(document.activeElement).toBe(q.getByLabelText(rotulo))
    }
    await userEvent.tab()
    expect(document.activeElement).toBe(q.getByRole('button', { name: 'Cancelar' }))
  })

  it('Esc fecha o quadro sem criar nada', async () => {
    await abrirForm()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(criarProjetoManual).not.toHaveBeenCalled()
  })
})
