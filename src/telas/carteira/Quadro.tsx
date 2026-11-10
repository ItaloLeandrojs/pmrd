// Quadro de diálogo (modal) simples: foco entra no primeiro campo, Esc fecha e o foco volta para quem abriu.
import { useEffect, useRef, type ReactNode } from 'react'
import { X } from '@phosphor-icons/react'

interface Props {
  titulo: string
  aoFechar: () => void
  children: ReactNode
}

const FOCAVEL = 'input, select, textarea, button:not([disabled]), [href]'

export function Quadro({ titulo, aoFechar, children }: Props) {
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const primeiro = raiz.current?.querySelector<HTMLElement>('input, select, textarea') ?? raiz.current?.querySelector<HTMLElement>(FOCAVEL)
    primeiro?.focus()
    return () => { if (anterior?.isConnected) anterior.focus() }
  }, [])

  return (
    <div className="quadro__fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <div
        ref={raiz}
        className="quadro"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); aoFechar(); return }
          // Tab fica preso dentro do quadro.
          if (e.key !== 'Tab') return
          const itens = [...(raiz.current?.querySelectorAll<HTMLElement>(FOCAVEL) ?? [])]
          if (itens.length === 0) return
          const primeiro = itens[0]
          const ultimo = itens[itens.length - 1]
          if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus() }
          else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus() }
        }}
      >
        <header className="quadro__topo">
          <h2 className="quadro__titulo">{titulo}</h2>
          <button type="button" className="quadro__x" aria-label="Fechar" title="Fechar (Esc)" onClick={aoFechar}>
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}
