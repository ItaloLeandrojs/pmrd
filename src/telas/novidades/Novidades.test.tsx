import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Cliente falso do Supabase: tabelas em memória e rpc espionada (a tela usa as funções reais de nuvem/novidades).
const falso = vi.hoisted(() => {
  type Resposta = { data: unknown; error: unknown }
  const estado = {
    tabelas: {} as Record<string, Record<string, unknown>[]>,
    rpc: (_nome: string, _args: unknown): Promise<Resposta> => Promise.resolve({ data: null, error: null }),
  }
  const thenable = (p: () => Promise<Resposta>) => {
    const b: Record<string, unknown> = { abortSignal: () => b }
    b.then = (ok: (r: Resposta) => unknown, ko: (e: unknown) => unknown) => p().then(ok, ko)
    return b
  }
  function construtor(nome: string) {
    const filtros: ((l: Record<string, unknown>) => boolean)[] = []
    let limite: number | null = null
    const b: Record<string, unknown> = {
      select: () => b,
      order: () => b,
      range: () => b,
      abortSignal: () => b,
      eq: (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return b },
      in: (c: string, vs: unknown[]) => { filtros.push((l) => vs.includes(l[c])); return b },
      limit: (n: number) => { limite = n; return b },
      then: (ok: (r: Resposta) => unknown, ko: (e: unknown) => unknown) => {
        let linhas = (estado.tabelas[nome] ?? []).filter((l) => filtros.every((f) => f(l)))
        if (limite !== null) linhas = linhas.slice(0, limite)
        return Promise.resolve({ data: structuredClone(linhas), error: null }).then(ok, ko)
      },
    }
    return b
  }
  const rpc = vi.fn((nome: string, args: unknown) => thenable(() => estado.rpc(nome, args)))
  return { estado, rpc, nuvem: { from: construtor, rpc } }
})

vi.mock('../../nuvem/cliente', () => ({ nuvem: falso.nuvem }))

import { Novidades } from './Novidades'

const AGORA = new Date('2026-11-10T15:00:00Z') // 12:00 em Fortaleza

const defeito = (id_gom: string, prioridade: number | null) => ({
  id_gom, prioridade, estrutura: 'EXEMPLO-EST-1', alimentador: 'EXEMPLO-AL-01', estado_enel: 'PENDENTE', lat: null, lng: null,
})

function novidades() {
  return [
    {
      id: 1, regional: 'SUL', projeto: 'EXEMPLO-0101', tipo: 'novo', situacao: 'aberta', criada_em: '2026-11-10T12:00:00Z',
      dados: { projeto: 'EXEMPLO-0101', municipio: 'Iguatu', alimentadores: ['EXEMPLO-AL-01'], defeitos: [defeito('EXEMPLO-D1', 7), defeito('EXEMPLO-D2', 9), defeito('EXEMPLO-D3', null)] },
    },
    {
      id: 2, regional: 'SUL', projeto: 'EXEMPLO-0102', tipo: 'novo', situacao: 'aberta', criada_em: '2026-11-10T12:00:00Z',
      dados: { projeto: 'EXEMPLO-0102', municipio: 'Crato', alimentadores: [], defeitos: [defeito('EXEMPLO-D4', 2)] },
    },
    {
      id: 3, regional: 'SUL', projeto: 'EXEMPLO-0003', tipo: 'mudou', situacao: 'aberta', criada_em: '2026-11-10T12:00:00Z',
      dados: { entram: [defeito('EXEMPLO-D9', 3)], saem: ['EXEMPLO-D5', 'EXEMPLO-D6'], prioridade_antes: 9, prioridade_nova: 3, alimentadores: [] },
    },
    {
      id: 4, regional: 'SUL', projeto: 'EXEMPLO-0006', tipo: 'saiu', situacao: 'aberta', criada_em: '2026-11-10T12:00:00Z',
      dados: { etapa: 'AGUARDANDO SGD' },
    },
    {
      id: 5, regional: 'SUL', projeto: 'EXEMPLO-0014', tipo: 'corrigido', situacao: 'aberta', criada_em: '2026-11-10T12:00:00Z',
      dados: { defeitos: [{ id_gom: 'EXEMPLO-D7', estado_enel: 'CORRIGIDO' }, { id_gom: 'EXEMPLO-D8', estado_enel: 'CORRIGIDO' }] },
    },
  ]
}

beforeEach(() => {
  falso.rpc.mockClear()
  falso.estado.rpc = () => Promise.resolve({ data: null, error: null })
  falso.estado.tabelas = {
    novidades: novidades(),
    importacoes: [
      { regional: 'SUL', tipo: 'demanda', quando: '2026-11-10T12:00:00Z', resumo: { avisos: ['Aviso de exemplo 1.', 'Aviso de exemplo 2.', 'Aviso de exemplo 3.'] }, erro: null },
    ],
    projetos: [
      { projeto: 'EXEMPLO-0003', municipio: 'Icó', prioridade: 9, etapa: 'EM ANÁLISE' },
      { projeto: 'EXEMPLO-0006', municipio: 'Russas', prioridade: 4, etapa: 'AGUARDANDO SGD' },
      { projeto: 'EXEMPLO-0014', municipio: 'Sobral', prioridade: 5, etapa: 'PROGRAMADA' },
    ],
  }
})

async function abrir(papel: 'admin' | 'equipe' = 'admin') {
  render(<Novidades regional="SUL" papel={papel} agora={AGORA} />)
  await screen.findByRole('tablist', { name: 'Tipos de novidade' })
}

const cartao = (projeto: string) => screen.getByRole('article', { name: projeto })

async function irPara(aba: RegExp) {
  await userEvent.click(screen.getByRole('tab', { name: aba }))
}

describe('Novidades da Enel', () => {
  it('abas por tipo com a contagem e o resumo do cartão', async () => {
    await abrir()
    expect(screen.getByRole('tab', { name: 'Novos 2' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Mudaram 1' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Saíram 1' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Corrigidos na Enel 1' })).toBeTruthy()
    const c = cartao('EXEMPLO-0101')
    expect(within(c).getByText('3 defeitos, prioridade 7 (Conj. crítico)')).toBeTruthy()
    expect(within(c).getByText('Iguatu')).toBeTruthy()
  })

  it('a faixa mostra a última importação e os avisos recolhidos', async () => {
    await abrir()
    expect(screen.getByText('Sul: lida hoje às 09:00')).toBeTruthy()
    expect(screen.getByText('3 avisos')).toBeTruthy()
  })

  it('última importação com erro mostra o texto do erro', async () => {
    falso.estado.tabelas.importacoes = [
      { regional: 'SUL', tipo: 'erro', quando: '2026-11-10T12:00:00Z', resumo: {}, erro: 'Aba DEMANDA MENSAL sem a coluna PROJETO.' },
    ]
    await abrir()
    expect(screen.getByText('Sul: a leitura de hoje às 09:00 deu erro')).toBeTruthy()
    expect(screen.getByText('Aba DEMANDA MENSAL sem a coluna PROJETO.')).toBeTruthy()
  })

  it('importação com mais de 26 horas avisa desde quando', async () => {
    falso.estado.tabelas.importacoes = [{ regional: 'SUL', tipo: 'demanda', quando: '2026-11-09T12:00:00Z', resumo: {}, erro: null }]
    await abrir()
    expect(screen.getByText('Sul: sem planilha nova desde 09/11 09:00')).toBeTruthy()
  })

  it('admin clica Aceitar num novo: chama aceitar_novidade com { p_id } e o cartão some', async () => {
    await abrir()
    await userEvent.click(within(cartao('EXEMPLO-0101')).getByRole('button', { name: 'Aceitar' }))
    expect(falso.rpc).toHaveBeenCalledWith('aceitar_novidade', { p_id: 1 })
    await waitFor(() => expect(screen.queryByRole('article', { name: 'EXEMPLO-0101' })).toBeNull())
    expect(screen.getByRole('tab', { name: 'Novos 1' })).toBeTruthy()
  })

  it('Recusar chama recusar_novidade e o cartão some', async () => {
    await abrir()
    await userEvent.click(within(cartao('EXEMPLO-0102')).getByRole('button', { name: 'Recusar' }))
    expect(falso.rpc).toHaveBeenCalledWith('recusar_novidade', { p_id: 2 })
    await waitFor(() => expect(screen.queryByRole('article', { name: 'EXEMPLO-0102' })).toBeNull())
  })

  it('o cartão só some depois que o banco confirma; "Salvando..." fica no botão e uma gravação por vez', async () => {
    let confirmar: (r: { data: unknown; error: unknown }) => void = () => {}
    falso.estado.rpc = () => new Promise((ok) => { confirmar = ok })
    await abrir()
    await userEvent.click(within(cartao('EXEMPLO-0101')).getByRole('button', { name: 'Aceitar' }))
    expect(within(cartao('EXEMPLO-0101')).getByRole('button', { name: 'Salvando...' })).toBeTruthy()
    // outra decisão enquanto a primeira não voltou: não grava
    await userEvent.click(within(cartao('EXEMPLO-0102')).getByRole('button', { name: 'Aceitar' }))
    expect(falso.rpc).toHaveBeenCalledTimes(1)
    confirmar({ data: null, error: null })
    await waitFor(() => expect(screen.queryByRole('article', { name: 'EXEMPLO-0101' })).toBeNull())
  })

  it('em Saíram não há Aceitar sem escolha: são 3 botões, e "Transferida" chama com p_escolha TRANSFERIDA', async () => {
    await abrir()
    await irPara(/^Saíram/)
    const c = cartao('EXEMPLO-0006')
    expect(within(c).queryByRole('button', { name: 'Aceitar' })).toBeNull()
    for (const nome of ['Manter na carteira', 'Transferida', 'Não executável']) {
      expect(within(c).getByRole('button', { name: nome })).toBeTruthy()
    }
    await userEvent.click(within(c).getByRole('button', { name: 'Transferida' }))
    expect(falso.rpc).toHaveBeenCalledWith('aceitar_novidade', { p_id: 4, p_escolha: 'TRANSFERIDA' })
    await waitFor(() => expect(screen.queryByRole('article', { name: 'EXEMPLO-0006' })).toBeNull())
  })

  it('em Saíram, "Manter na carteira" manda MANTER e "Não executável" manda NÃO EXECUTÁVEL', async () => {
    falso.estado.tabelas.novidades.push({ ...novidades()[3], id: 6, projeto: 'EXEMPLO-0007' })
    await abrir()
    await irPara(/^Saíram/)
    await userEvent.click(within(cartao('EXEMPLO-0006')).getByRole('button', { name: 'Manter na carteira' }))
    expect(falso.rpc).toHaveBeenCalledWith('aceitar_novidade', { p_id: 4, p_escolha: 'MANTER' })
    await waitFor(() => expect(screen.queryByRole('article', { name: 'EXEMPLO-0006' })).toBeNull())
    await userEvent.click(within(cartao('EXEMPLO-0007')).getByRole('button', { name: 'Não executável' }))
    expect(falso.rpc).toHaveBeenCalledWith('aceitar_novidade', { p_id: 6, p_escolha: 'NÃO EXECUTÁVEL' })
  })

  it('em Corrigidos: "Dar como executado" manda EXECUTADO e "Tirar do projeto" existe', async () => {
    await abrir()
    await irPara(/^Corrigidos na Enel/)
    const c = cartao('EXEMPLO-0014')
    expect(within(c).getByText('2 defeitos fechados na Enel: CORRIGIDO')).toBeTruthy()
    expect(within(c).getByRole('button', { name: 'Tirar do projeto' })).toBeTruthy()
    await userEvent.click(within(c).getByRole('button', { name: 'Dar como executado' }))
    expect(falso.rpc).toHaveBeenCalledWith('aceitar_novidade', { p_id: 5, p_escolha: 'EXECUTADO' })
  })

  it('selecionar 2 e "Aceitar selecionadas (2)" chama aceitar_novidades com os 2 ids', async () => {
    falso.estado.rpc = (nome) => Promise.resolve({ data: nome === 'aceitar_novidades' ? 2 : null, error: null })
    await abrir()
    const lote = () => screen.getByRole('button', { name: /^Aceitar selecionadas/ })
    expect(lote().getAttribute('aria-disabled')).toBe('true')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar EXEMPLO-0101' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar EXEMPLO-0102' }))
    expect(lote().textContent).toBe('Aceitar selecionadas (2)')
    await userEvent.click(lote())
    expect(falso.rpc).toHaveBeenCalledWith('aceitar_novidades', { p_ids: [1, 2] })
    await waitFor(() => expect(screen.queryByRole('article', { name: 'EXEMPLO-0101' })).toBeNull())
    expect(screen.queryByRole('article', { name: 'EXEMPLO-0102' })).toBeNull()
  })

  it('erro no lote: o aviso fica, a lista é recarregada do banco e a seleção é limpa', async () => {
    const msg = 'A novidade de EXEMPLO-0102 já foi decidida ou trocada por uma mais nova. Recarregue a tela.'
    falso.estado.rpc = (nome) => {
      if (nome !== 'aceitar_novidades') return Promise.resolve({ data: null, error: null })
      // Enquanto a tela estava aberta, o importador trocou a novidade do EXEMPLO-0102 por uma mais nova.
      falso.estado.tabelas.novidades = falso.estado.tabelas.novidades
        .filter((n) => n.id !== 2)
        .concat({ ...novidades()[1], id: 7 })
      return Promise.resolve({ data: null, error: { code: 'P0001', message: msg } })
    }
    await abrir()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar EXEMPLO-0101' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar EXEMPLO-0102' }))
    await userEvent.click(screen.getByRole('button', { name: /^Aceitar selecionadas/ }))
    expect((await screen.findByRole('alert')).textContent).toContain(msg)
    // Recarregou: a novidade nova (id 7) entrou no lugar da trocada, e nada ficou marcado.
    await waitFor(() => expect(screen.getByRole('button', { name: /^Aceitar selecionadas/ }).textContent).toBe('Aceitar selecionadas (0)'))
    for (const c of screen.getAllByRole('checkbox')) expect((c as HTMLInputElement).checked).toBe(false)
    expect(cartao('EXEMPLO-0101')).toBeTruthy()
    expect(cartao('EXEMPLO-0102')).toBeTruthy()
    // Marcar de novo e aceitar manda o id novo, não o trocado.
    falso.estado.rpc = () => Promise.resolve({ data: 2, error: null })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas' }))
    await userEvent.click(screen.getByRole('button', { name: /^Aceitar selecionadas/ }))
    expect(falso.rpc).toHaveBeenLastCalledWith('aceitar_novidades', { p_ids: [1, 7] })
  })

  it('erro do banco aparece em role="alert" e o cartão fica', async () => {
    const msg = 'Este projeto já está na carteira. Recuse esta novidade: a próxima importação mostra o que mudou.'
    falso.estado.rpc = () => Promise.resolve({ data: null, error: { code: 'P0001', message: msg } })
    await abrir()
    await userEvent.click(within(cartao('EXEMPLO-0101')).getByRole('button', { name: 'Aceitar' }))
    expect((await screen.findByRole('alert')).textContent).toContain(msg)
    expect(cartao('EXEMPLO-0101')).toBeTruthy()
    expect(within(cartao('EXEMPLO-0101')).getByRole('button', { name: 'Aceitar' })).toBeTruthy()
  })

  it('perfil equipe só vê a lista, sem nenhum botão, com a frase do administrador', async () => {
    await abrir('equipe')
    expect(screen.getByText('Só um administrador aceita ou recusa as novidades.')).toBeTruthy()
    expect(screen.getByRole('article', { name: 'EXEMPLO-0101' })).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    await irPara(/^Saíram/)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('sem novidades: "Nenhuma novidade da Enel para decidir."', async () => {
    falso.estado.tabelas.novidades = []
    render(<Novidades regional="SUL" papel="admin" agora={AGORA} />)
    expect(await screen.findByText('Nenhuma novidade da Enel para decidir.')).toBeTruthy()
  })
})
