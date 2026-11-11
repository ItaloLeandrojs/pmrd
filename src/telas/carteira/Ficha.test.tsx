import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FichaProjeto, ProjetoLinha } from '../../nuvem/carteira'

vi.mock('../../nuvem/cliente', () => ({ nuvem: {} }))
vi.mock('../../nuvem/carteira', async (original) => ({
  ...(await original<typeof import('../../nuvem/carteira')>()),
  carregarFicha: vi.fn(),
}))

import { carregarFicha } from '../../nuvem/carteira'
import { Ficha } from './Ficha'

const PARAMETROS = {
  validade_vistoria: 180, prazo_reenvio_vistoria: 7, alerta_vencimento: 30, alerta_prazo: 3,
  parado_amarelo: 7, parado_vermelho: 15, raio_mapa_km: 10,
}
const PESSOAS = [{ id: 'u1', nome: 'Pessoa Teste', ativo: true }]

const linha: ProjetoLinha = {
  projeto: 'EXEMPLO-001', regional: 'SUL', origem: 'enel', municipio: 'Cidade Teste', prioridade: 5, pedido_gestor: false,
  pedido_gestor_em: null, pedido_gestor_por: null, qtd_defeitos: 2, alimentadores: ['AL-1'], etapa: 'SOLICITAR VISTORIA',
  etapa_desde: '2026-11-08T12:00:00+00:00', proxima_acao: null, prazo_proxima_acao: null, vistoria_data: '2026-10-01',
  responsavel: null, atualizado_em: '2026-11-09T10:00:00.123+00:00',
}

function ficha(extra: Partial<FichaProjeto> = {}): FichaProjeto {
  return {
    projeto: {
      ...linha, ot_correcao: 'OT-EXEMPLO', endereco: 'Rua Exemplo, 10', elemento_corte: 'CF-EXEMPLO', qtd_clientes: 120,
      estruturas: ['E1', 'E2'], intervencao_prevista: 'DESL MT', vistoria_situacao: 'Favorável',
      vistoria_recurso: 'Cesto', vistoria_intervencao: 'Troca de cruzeta', vistoria_observacao: 'Observação de teste',
      vistoria_enviada_em: '2026-09-28', saiu_da_demanda: false,
    },
    defeitos: [
      { id_gom: 'GOM-EXEMPLO-1', prioridade: 5, estrutura: 'E1', alimentador: 'AL-1', situacao: 'pendente' },
      { id_gom: 'GOM-EXEMPLO-2', prioridade: 6, estrutura: 'E2', alimentador: 'AL-1', situacao: 'programado' },
    ],
    historico: [
      // mais recente primeiro; 2026-11-09T01:00Z ainda é 08/11 em Fortaleza (UTC-3)
      { quando: '2026-11-09T01:00:00+00:00', quem: 'u1', antes: { etapa: 'EM ANÁLISE', atualizado_em: 'x' }, depois: { etapa: 'SOLICITAR VISTORIA', atualizado_em: 'y' } },
      { quando: '2026-11-05T15:00:00+00:00', quem: 'u1', antes: { etapa_desde: 'a' }, depois: { etapa_desde: 'b' } },
    ],
    ...extra,
  }
}

beforeEach(() => vi.mocked(carregarFicha).mockReset())

function abrir(f: FichaProjeto = ficha(), props: Partial<React.ComponentProps<typeof Ficha>> = {}) {
  vi.mocked(carregarFicha).mockResolvedValue(f)
  return render(
    <Ficha linha={f.projeto} pessoas={PESSOAS} parametros={PARAMETROS} hoje="2026-11-09" aoFechar={() => {}} aoPedidoGestor={() => {}} {...props} />,
  )
}

describe('Ficha', () => {
  it('a área que rola é uma região nomeada que o teclado alcança (axe: scrollable-region-focusable)', async () => {
    abrir()
    const corpo = await screen.findByRole('region', { name: 'Detalhes do projeto EXEMPLO-001' })
    expect(corpo.getAttribute('tabindex')).toBe('0')
  })

  it('mostra as seções Dados, Defeitos, Vistoria, Programações e retornos e Histórico', async () => {
    abrir()
    await screen.findByRole('heading', { name: 'Dados' })
    for (const nome of ['Defeitos', 'Vistoria', 'Programações e retornos', 'Histórico']) {
      expect(screen.getByRole('heading', { name: new RegExp(`^${nome}`) })).toBeTruthy()
    }
    expect(screen.getByText(/Chega no plano 3/)).toBeTruthy()
    expect(screen.getByText('OT-EXEMPLO')).toBeTruthy()
    expect(screen.getByText('GOM-EXEMPLO-1')).toBeTruthy()
    expect(screen.getByText('GOM-EXEMPLO-2')).toBeTruthy()
    // situação do defeito escrita
    expect(screen.getByText('programado')).toBeTruthy()
  })

  it('histórico: "campo: antes → depois", com o nome de quem mudou e a data em DD/MM/AAAA (dia de Fortaleza)', async () => {
    abrir()
    const secao = (await screen.findByRole('heading', { name: 'Histórico' })).closest('section') as HTMLElement
    expect(within(secao).getByText('etapa: EM ANÁLISE → SOLICITAR VISTORIA')).toBeTruthy()
    expect(within(secao).getAllByText(/Pessoa Teste/).length).toBeGreaterThan(0)
    expect(within(secao).getByText(/08\/11\/2026/)).toBeTruthy()
    // atualizado_em e etapa_desde não entram; o registro só com etapa_desde some
    expect(within(secao).queryByText(/atualizado_em/)).toBeNull()
    expect(within(secao).queryByText(/etapa_desde/)).toBeNull()
    expect(within(secao).queryByText(/05\/11\/2026/)).toBeNull()
  })

  it('histórico da ordem mais recente primeiro', async () => {
    const f = ficha({
      historico: [
        { quando: '2026-11-09T15:00:00+00:00', quem: 'u1', antes: { proxima_acao: 'a' }, depois: { proxima_acao: 'b' } },
        { quando: '2026-11-02T15:00:00+00:00', quem: 'u1', antes: { proxima_acao: null }, depois: { proxima_acao: 'a' } },
      ],
    })
    abrir(f)
    const itens = within((await screen.findByRole('heading', { name: 'Histórico' })).closest('section') as HTMLElement).getAllByRole('listitem')
    expect(itens[0].textContent).toMatch(/09\/11\/2026/)
    expect(itens[1].textContent).toMatch(/02\/11\/2026/)
    expect(itens[1].textContent).toMatch(/proxima_acao: vazio → a/)
  })

  it('quem mudou desconhecido não quebra, e a inclusão aparece como projeto criado', async () => {
    abrir(ficha({ historico: [{ quando: '2026-11-02T15:00:00+00:00', quem: 'u-saiu', antes: {}, depois: { projeto: 'EXEMPLO-001', etapa: 'EM ANÁLISE' } }] }))
    const secao = (await screen.findByRole('heading', { name: 'Histórico' })).closest('section') as HTMLElement
    expect(within(secao).getByText(/Pessoa removida/)).toBeTruthy()
    expect(within(secao).getByText('Projeto criado')).toBeTruthy()
  })

  it('projeto que saiu da demanda mostra a marca "Saiu da demanda da Enel" escrita', async () => {
    const f = ficha(); f.projeto = { ...f.projeto, saiu_da_demanda: true }
    abrir(f)
    expect(await screen.findByText('Saiu da demanda da Enel')).toBeTruthy()
  })

  it('projeto na demanda não mostra a marca', async () => {
    abrir()
    await screen.findByRole('heading', { name: 'Dados' })
    expect(screen.queryByText('Saiu da demanda da Enel')).toBeNull()
  })

  it('"ver no mapa" fica desligado com a dica "Chega no plano 4"', async () => {
    abrir()
    const b = (await screen.findByRole('button', { name: /Ver no mapa/ })) as HTMLButtonElement
    expect(b.disabled).toBe(true)
    expect(b.title).toBe('Chega no plano 4')
  })

  it('pedido do gestor: ligar chama aoPedidoGestor; com pedido, mostra quem pediu e quando', async () => {
    const aoPedidoGestor = vi.fn()
    const { unmount } = abrir(ficha(), { aoPedidoGestor })
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar pedido do gestor' }))
    expect(aoPedidoGestor).toHaveBeenCalledWith('marcar')
    unmount()

    const comPedido = { ...linha, pedido_gestor: true, pedido_gestor_em: '2026-11-05', pedido_gestor_por: 'Gestor Teste' }
    const f = ficha(); f.projeto = { ...f.projeto, ...comPedido }
    abrir(f, { aoPedidoGestor, linha: comPedido })
    expect(await screen.findByText(/Gestor Teste/)).toBeTruthy()
    expect(screen.getByText(/05\/11\/2026/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Tirar o pedido do gestor' }))
    expect(aoPedidoGestor).toHaveBeenCalledWith('tirar')
    await userEvent.click(screen.getByRole('button', { name: 'Editar o pedido do gestor' }))
    expect(aoPedidoGestor).toHaveBeenCalledWith('editar')
  })

  it('erro ao carregar: mensagem e "Tentar de novo"', async () => {
    vi.mocked(carregarFicha).mockRejectedValueOnce(new Error('x'))
    render(<Ficha linha={linha} pessoas={PESSOAS} parametros={PARAMETROS} hoje="2026-11-09" aoFechar={() => {}} aoPedidoGestor={() => {}} />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    vi.mocked(carregarFicha).mockResolvedValueOnce(ficha())
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { name: 'Dados' })).toBeTruthy()
  })
})
