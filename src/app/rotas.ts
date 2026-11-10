// Telas do app, ordem do menu e regras de regional (spec 7, Navegação).
import type { Icon } from '@phosphor-icons/react'
import {
  ArrowUDownLeft, CalendarDots, ChartLineUp, FlagBanner, FileText, MapTrifold,
  PresentationChart, SlidersHorizontal, Stack, SunHorizon, TrayArrowDown,
} from '@phosphor-icons/react'
import type { FiltroRegional, Papel, Regional } from '../dominio/tipos'

export type IdTela =
  | 'hoje' | 'agenda' | 'carteira' | 'mapa' | 'sgd' | 'retorno'
  | 'reports' | 'indicadores' | 'novidades' | 'saga' | 'configuracoes'

export interface Tela {
  id: IdTela
  nome: string
  icone: Icon
  grupo: 'principal' | 'apoio'
  soAdmin: boolean
  aceitaTodas: boolean
  /** Plano do roteiro em que a tela chega; 1 significa "neste plano" (aviso "em breve"). */
  plano: number
}

export const TELAS: readonly Tela[] = [
  { id: 'hoje', nome: 'Hoje', icone: SunHorizon, grupo: 'principal', soAdmin: false, aceitaTodas: true, plano: 4 },
  { id: 'agenda', nome: 'Agenda', icone: CalendarDots, grupo: 'principal', soAdmin: false, aceitaTodas: false, plano: 3 },
  { id: 'carteira', nome: 'Carteira', icone: Stack, grupo: 'principal', soAdmin: false, aceitaTodas: true, plano: 1 },
  { id: 'mapa', nome: 'Mapa', icone: MapTrifold, grupo: 'principal', soAdmin: false, aceitaTodas: true, plano: 4 },
  { id: 'sgd', nome: 'SGD', icone: FileText, grupo: 'principal', soAdmin: false, aceitaTodas: true, plano: 3 },
  { id: 'retorno', nome: 'Retorno', icone: ArrowUDownLeft, grupo: 'principal', soAdmin: false, aceitaTodas: true, plano: 3 },
  { id: 'reports', nome: 'Reports', icone: PresentationChart, grupo: 'principal', soAdmin: false, aceitaTodas: true, plano: 5 },
  { id: 'indicadores', nome: 'Indicadores', icone: ChartLineUp, grupo: 'principal', soAdmin: false, aceitaTodas: true, plano: 4 },
  { id: 'novidades', nome: 'Novidades da Enel', icone: TrayArrowDown, grupo: 'apoio', soAdmin: false, aceitaTodas: true, plano: 2 },
  { id: 'saga', nome: 'SAGA', icone: FlagBanner, grupo: 'apoio', soAdmin: false, aceitaTodas: true, plano: 4 },
  { id: 'configuracoes', nome: 'Configurações', icone: SlidersHorizontal, grupo: 'apoio', soAdmin: true, aceitaTodas: true, plano: 1 },
]

export function telasVisiveis(papel: Papel): Tela[] {
  return TELAS.filter((t) => papel === 'admin' || !t.soAdmin)
}

/** Telas que não aceitam "Todas" usam a última regional única escolhida. */
export function regionalEfetiva(tela: Tela, escolhida: FiltroRegional, ultimaUnica: Regional): FiltroRegional {
  return escolhida === 'TODAS' && !tela.aceitaTodas ? ultimaUnica : escolhida
}

export function lerRota(hash: string): IdTela {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return TELAS.find((t) => t.id === id)?.id ?? 'hoje'
}
