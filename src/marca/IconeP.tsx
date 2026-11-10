// Ícone do menu e da aba: o P sobre o condutor de ponta a ponta (variação B, spec 9).
interface Props {
  tamanho?: number
}

export function IconeP({ tamanho = 32 }: Props) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 30 30" role="img" aria-label="PMRD">
      <rect width="30" height="30" rx="8" fill="#0C3B40" />
      <path d="M10.2 8h5.4c2.6 0 4.2 1.5 4.2 3.8s-1.6 3.8-4.2 3.8h-2.4V19h-3V8zm3 2.5v2.6h2.1c1 0 1.6-.5 1.6-1.3s-.6-1.3-1.6-1.3h-2.1z" fill="#E3C77A" />
      <line x1="6" y1="23" x2="24" y2="23" stroke="#E3C77A" strokeWidth="2" />
      <circle cx="5.5" cy="23" r="2.2" fill="#E3C77A" />
      <circle cx="24.5" cy="23" r="2.2" fill="#0C3B40" stroke="#E3C77A" strokeWidth="1.2" />
    </svg>
  )
}
