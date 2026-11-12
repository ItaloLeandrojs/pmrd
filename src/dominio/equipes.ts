import type { TipoEquipe } from './tipos'

export const BASES: Record<string, string> = {
  JZN: 'Juazeiro',
  MLG: 'Milagres',
  ICO: 'Icó',
  IGT: 'Iguatu',
  CPS: 'Campos Sales',
  SNP: 'Senador Pompeu',
  TAA: 'Tauá',
  RSL: 'Limoeiro',
  ART: 'Aracati',
  JGB: 'Jaguaribe',
}

/** Ordem do seletor da tela de equipes; igual à restrição do banco (002, seção 10). */
export const TIPOS_EQUIPE: TipoEquipe[] = [
  'ML', 'LVR', 'MP', 'LV', 'RD', 'LB', 'LN', 'MM', 'SK', 'GA', 'TR', 'RL', 'LM', 'MO',
]

export function baseDoLid(lid: string): string | null {
  const prefixo = lid.split('-')[0]
  return Object.hasOwn(BASES, prefixo) ? prefixo : null
}

/** Grupo do Report sugerido; o admin pode trocar. LVR conta como Linha Viva; os tipos novos não têm grupo. */
export function grupoSugerido(tipo: TipoEquipe, base: string | null): string | null {
  if (tipo === 'MP') return 'Manutenção Pesada'
  if (tipo === 'LV' || tipo === 'LVR') return 'Linha Viva'
  if (tipo !== 'ML' || base === null || !Object.hasOwn(BASES, base)) return null
  return `ML ${BASES[base]}`
}
