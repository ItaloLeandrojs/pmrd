// Tema claro/escuro: 'sistema' segue o Windows; o html sempre recebe o tema efetivo em data-tema.
import type { Tema } from '../dominio/tipos'

const MEDIA_ESCURO = '(prefers-color-scheme: dark)'

function temMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

export function temaEfetivo(tema: Tema): 'claro' | 'escuro' {
  if (tema === 'sistema') return temMedia() && window.matchMedia(MEDIA_ESCURO).matches ? 'escuro' : 'claro'
  return tema
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.setAttribute('data-tema', temaEfetivo(tema))
}

/** Alterna a partir do tema que a pessoa está vendo agora. */
export function alternarTema(tema: Tema): 'claro' | 'escuro' {
  return temaEfetivo(tema) === 'escuro' ? 'claro' : 'escuro'
}

/** Enquanto o tema for 'sistema', acompanha a troca do Windows. Devolve a função de limpeza. */
export function seguirSistema(tema: Tema): () => void {
  if (tema !== 'sistema' || !temMedia()) return () => {}
  const m = window.matchMedia(MEDIA_ESCURO)
  const ao = () => aplicarTema('sistema')
  m.addEventListener('change', ao)
  return () => m.removeEventListener('change', ao)
}
