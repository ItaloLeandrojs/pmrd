// Transforma um registro do histórico em linhas "campo: antes → depois" para a ficha.
import { formatarBR } from '../../dominio/datas'

// O gatilho do banco já deixa de fora estes dois; aqui é só garantia para registros antigos.
const IGNORADOS = new Set(['atualizado_em', 'etapa_desde'])

export function formatarValor(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'vazio'
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatarBR(v) : v
  if (Array.isArray(v)) return v.length === 0 ? 'vazio' : v.map(formatarValor).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Uma linha por campo que mudou. Vazio quando só mudaram campos ignorados. */
export function mudancasDeCampo(antes: Record<string, unknown>, depois: Record<string, unknown>): string[] {
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter((k) => !IGNORADOS.has(k))
  return campos
    .filter((k) => JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null))
    .map((k) => `${k}: ${formatarValor(antes[k])} → ${formatarValor(depois[k])}`)
}
