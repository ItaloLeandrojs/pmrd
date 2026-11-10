// Regras do projeto digitado à mão: normalização do número e validação antes de gravar.
import type { Regional } from '../../dominio/tipos'

export interface NovoProjeto {
  projeto: string
  regional: Regional
  municipio: string
  prioridade: number | null
  ot_correcao?: string
  endereco?: string
  intervencao_prevista?: string
  /** ID GOM dos defeitos, um por item. Projeto sem ID GOM (RESU, TSSU) informa `qtd_defeitos`. */
  ids_gom?: string[]
  qtd_defeitos?: number
}

/** O projeto é guardado sem espaços e em maiúsculas. */
export function normalizarProjeto(p: string): string {
  return p.replace(/\s+/g, '').toUpperCase()
}

/** `existentes` já vem normalizado (maiúsculas, sem espaços). Devolve a mensagem do primeiro problema, ou null. */
export function validarNovoProjeto(n: NovoProjeto, existentes: Set<string>): string | null {
  const projeto = normalizarProjeto(n.projeto)
  if (projeto === '') return 'Falta o número do projeto.'
  if (existentes.has(projeto)) return 'Este projeto já está na carteira.'
  if (n.municipio.trim() === '') return 'Falta o município.'

  const ids = (n.ids_gom ?? []).map((x) => x.trim()).filter((x) => x !== '')
  if (ids.length === 0) {
    const q = n.qtd_defeitos
    if (q === undefined || !Number.isInteger(q) || q < 1) return 'Informe os ID GOM ou a quantidade de defeitos.'
    return null
  }
  const vistos = new Map<string, string>()
  for (const id of ids) {
    const chave = id.toUpperCase()
    const primeiro = vistos.get(chave)
    if (primeiro !== undefined) return `ID GOM repetido na lista: ${primeiro}.`
    vistos.set(chave, id)
  }
  return null
}
