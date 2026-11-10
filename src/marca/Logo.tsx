// Marca PMRD, variação B: o condutor corre sob a sigla inteira, do ponto cheio (subestação)
// ao ponto vazado (ligação do cliente). Cores vêm dos tokens, então vale nos dois temas.
interface Props {
  /** Tamanho da sigla em px. */
  tamanho?: number
  /** Mostra o selo MT/BT ao lado da sigla. */
  selo?: boolean
}

export function Logo({ tamanho = 40, selo = true }: Props) {
  return (
    <span className="logo" role="img" aria-label="PMRD" style={{ fontSize: tamanho }}>
      <span aria-hidden="true" className="logo__texto">
        PM<span className="logo__rd">RD</span>
        {selo && <span className="logo__selo">MT/BT</span>}
        <span className="logo__fio">
          <svg viewBox="0 0 100 10" preserveAspectRatio="none">
            <line x1="3" y1="5" x2="97" y2="5" stroke="#E3C77A" strokeWidth={tamanho >= 60 ? 7 : 3} vectorEffect="non-scaling-stroke" />
          </svg>
          <svg viewBox="0 0 10 10" style={{ right: 'auto', left: '-.12em', width: '.3em' }}>
            <circle cx="5" cy="5" r="3.6" fill="#E3C77A" />
          </svg>
          <svg viewBox="0 0 10 10" style={{ left: 'auto', right: '-.12em', width: '.3em' }}>
            <circle className="logo__ponta" cx="5" cy="5" r="3.6" stroke="#E3C77A" strokeWidth="1.6" />
          </svg>
        </span>
      </span>
    </span>
  )
}
