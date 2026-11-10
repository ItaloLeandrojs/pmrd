import { diasEntre, somarDias } from './datas'
import type { DataISO } from './tipos'

export type SituacaoVistoria = 'sem vistoria' | 'válida' | 'vencendo' | 'vencida'

export function situacaoVistoria(
  dataVistoria: DataISO | null,
  hoje: DataISO,
  p: { validade_vistoria: number; alerta_vencimento: number },
): { situacao: SituacaoVistoria; validade: DataISO | null; diasRestantes: number | null } {
  if (dataVistoria === null) return { situacao: 'sem vistoria', validade: null, diasRestantes: null }
  const validade = somarDias(dataVistoria, p.validade_vistoria)
  const diasRestantes = diasEntre(hoje, validade)
  const situacao: SituacaoVistoria =
    diasRestantes < 0 ? 'vencida' : diasRestantes <= p.alerta_vencimento ? 'vencendo' : 'válida'
  return { situacao, validade, diasRestantes }
}
