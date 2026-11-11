import type { TipoEquipe } from './tipos'

export const BASES: Record<string, string> = {
  JZN: 'Juazeiro',
  MLG: 'Milagres',
  ICO: 'Icó',
  IGT: 'Iguatu',
  CPS: 'Campos Sales',
  SNP: 'Senador Pompeu',
  TAA: 'Tauá',
}

export function baseDoLid(lid: string): string | null {
  const prefixo = lid.split('-')[0]
  return Object.hasOwn(BASES, prefixo) ? prefixo : null
}

/** Grupo do Report sugerido; o admin pode trocar. LVR conta como Linha Viva. */
export function grupoSugerido(tipo: TipoEquipe, base: string | null): string | null {
  if (tipo === 'MP') return 'Manutenção Pesada'
  if (tipo === 'LV' || tipo === 'LVR') return 'Linha Viva'
  if (base === null || !Object.hasOwn(BASES, base)) return null
  return `ML ${BASES[base]}`
}
