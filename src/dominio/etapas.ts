import { diasEntre, hojeEmFortaleza } from './datas'
import type { DataISO } from './tipos'

export const ETAPAS = [
  'EM ANÁLISE',
  'SOLICITAR VISTORIA',
  'AGUARDANDO VISTORIA',
  'ANÁLISE PÓS-VISTORIA',
  'PROGRAMAR EXECUÇÃO',
  'SOLICITAR SGD',
  'AGUARDANDO SGD',
  'PROGRAMADA',
  'PENDENTE DE RETORNO',
  'EXECUTADA',
  'TRANSFERIDA',
  'NÃO EXECUTÁVEL',
] as const

export type Etapa = (typeof ETAPAS)[number]

export type ColunaQuadro = 'analise' | 'vistoria' | 'programar' | 'sgd' | 'pronta' | 'retorno' | 'concluidas'

const COLUNAS: Record<Etapa, ColunaQuadro> = {
  'EM ANÁLISE': 'analise',
  'SOLICITAR VISTORIA': 'vistoria',
  'AGUARDANDO VISTORIA': 'vistoria',
  'ANÁLISE PÓS-VISTORIA': 'vistoria',
  'PROGRAMAR EXECUÇÃO': 'programar',
  'SOLICITAR SGD': 'sgd',
  'AGUARDANDO SGD': 'sgd',
  PROGRAMADA: 'pronta',
  'PENDENTE DE RETORNO': 'retorno',
  EXECUTADA: 'concluidas',
  TRANSFERIDA: 'concluidas',
  'NÃO EXECUTÁVEL': 'concluidas',
}

export function colunaDaEtapa(e: Etapa): ColunaQuadro {
  return COLUNAS[e]
}

export function etapaConcluida(e: Etapa): boolean {
  return COLUNAS[e] === 'concluidas'
}

/** Dias desde que o projeto entrou na etapa, contando pela data de Fortaleza. */
export function diasParado(etapaDesde: string, hoje: DataISO): number {
  return diasEntre(hojeEmFortaleza(new Date(etapaDesde)), hoje)
}

export function corParado(
  dias: number,
  p: { parado_amarelo: number; parado_vermelho: number },
): 'normal' | 'amarelo' | 'vermelho' {
  if (dias >= p.parado_vermelho) return 'vermelho'
  if (dias >= p.parado_amarelo) return 'amarelo'
  return 'normal'
}
