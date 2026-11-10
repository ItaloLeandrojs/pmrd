export const PRIORIDADES: Record<number, string> = {
  1: 'Justiça',
  2: 'RNT',
  3: 'Ouvidoria',
  4: 'Banco regulador',
  5: 'TLC',
  6: 'Tripsaver',
  7: 'Conj. crítico',
  8: 'Obra',
  9: 'WTS',
  10: 'Plano PCB',
  11: 'Demanda extra',
}

/** A prioridade do projeto é a mais alta entre os defeitos (o menor número). */
export function prioridadeDoProjeto(dosDefeitos: number[]): number | null {
  return dosDefeitos.length === 0 ? null : Math.min(...dosDefeitos)
}

/** Chave de ordenação crescente: pedido do gestor primeiro, sem prioridade por último. */
export function chaveDeOrdem(p: { pedido_gestor: boolean; prioridade: number | null }): number {
  if (p.pedido_gestor) return 0
  return p.prioridade ?? 99
}
