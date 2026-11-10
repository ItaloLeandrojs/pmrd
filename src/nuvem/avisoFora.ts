// Aviso de gravação que falhou depois que a pessoa saiu da tela: a casca mostra até ela fechar.
import { useSyncExternalStore } from 'react'

let atual: string | null = null
const ouvintes = new Set<() => void>()

function avisar(): void {
  ouvintes.forEach((f) => f())
}

export function avisarFora(mensagem: string): void {
  atual = mensagem
  avisar()
}

export function fecharAvisoFora(): void {
  atual = null
  avisar()
}

function assinar(f: () => void): () => void {
  ouvintes.add(f)
  return () => { ouvintes.delete(f) }
}

export function useAvisoFora(): string | null {
  return useSyncExternalStore(assinar, () => atual, () => null)
}
