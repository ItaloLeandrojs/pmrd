// Atalhos, busca e ordem da Carteira (spec 7). Tudo puro: recebe as linhas e devolve as linhas.
import { etapaConcluida, type Etapa } from '../../dominio/etapas'
import { chaveDeOrdem } from '../../dominio/prioridades'
import { normalizar } from '../../dominio/texto'
import type { DataISO } from '../../dominio/tipos'
import type { ProjetoLinha } from '../../nuvem/carteira'

export type Atalho = 'todas' | 'vistoria' | 'programar' | 'sgd' | 'programadas' | 'atrasadas'

export const ATALHOS: readonly { id: Atalho; nome: string }[] = [
  { id: 'todas', nome: 'Todas' },
  { id: 'vistoria', nome: 'Vistoria' },
  { id: 'programar', nome: 'Programar' },
  { id: 'sgd', nome: 'SGD' },
  { id: 'programadas', nome: 'Programadas' },
  { id: 'atrasadas', nome: 'Atrasadas' },
]

const ETAPAS_DO_ATALHO: Record<Exclude<Atalho, 'todas' | 'atrasadas'>, readonly Etapa[]> = {
  vistoria: ['SOLICITAR VISTORIA', 'AGUARDANDO VISTORIA', 'ANÁLISE PÓS-VISTORIA'],
  programar: ['PROGRAMAR EXECUÇÃO'],
  sgd: ['SOLICITAR SGD', 'AGUARDANDO SGD'],
  programadas: ['PROGRAMADA'],
}

export interface OpcoesFiltro {
  atalho: Atalho
  busca: string
  mostrarConcluidas: boolean
  hoje: DataISO
}

function noAtalho(l: ProjetoLinha, atalho: Atalho, hoje: DataISO): boolean {
  if (atalho === 'todas') return true
  if (atalho === 'atrasadas') {
    return l.prazo_proxima_acao !== null && l.prazo_proxima_acao < hoje && !etapaConcluida(l.etapa)
  }
  return ETAPAS_DO_ATALHO[atalho].includes(l.etapa)
}

function textoBuscavel(l: ProjetoLinha): string {
  return normalizar([l.projeto, l.municipio ?? '', l.alimentadores.join(' '), l.proxima_acao ?? ''].join(' '))
}

function comparar(a: ProjetoLinha, b: ProjetoLinha): number {
  const porPrioridade = chaveDeOrdem(a) - chaveDeOrdem(b)
  if (porPrioridade !== 0) return porPrioridade
  if (a.prazo_proxima_acao !== b.prazo_proxima_acao) {
    if (a.prazo_proxima_acao === null) return 1
    if (b.prazo_proxima_acao === null) return -1
    return a.prazo_proxima_acao < b.prazo_proxima_acao ? -1 : 1
  }
  return a.projeto < b.projeto ? -1 : a.projeto > b.projeto ? 1 : 0
}

export function filtrarCarteira(linhas: ProjetoLinha[], o: OpcoesFiltro): ProjetoLinha[] {
  const termo = normalizar(o.busca)
  return linhas
    .filter((l) => (o.mostrarConcluidas || !etapaConcluida(l.etapa)) && noAtalho(l, o.atalho, o.hoje))
    .filter((l) => termo === '' || textoBuscavel(l).includes(termo))
    .sort(comparar)
}

/** Quantos projetos cada atalho mostra (sem busca e sem concluídas). */
export function contarAtalhos(linhas: ProjetoLinha[], hoje: DataISO): Record<Atalho, number> {
  const contagem = {} as Record<Atalho, number>
  for (const { id } of ATALHOS) {
    contagem[id] = filtrarCarteira(linhas, { atalho: id, busca: '', mostrarConcluidas: false, hoje }).length
  }
  return contagem
}
