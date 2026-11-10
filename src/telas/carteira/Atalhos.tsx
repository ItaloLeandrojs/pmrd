// Atalhos de filtro no alto da Carteira, na ordem do fluxo (spec 7). O nome fica sempre escrito.
import { Warning } from '@phosphor-icons/react'
import { ATALHOS, type Atalho } from './filtros'

interface Props {
  ativo: Atalho
  contagem: Record<Atalho, number>
  aoEscolher: (a: Atalho) => void
}

export function Atalhos({ ativo, contagem, aoEscolher }: Props) {
  return (
    <div className="cart__atalhos" role="group" aria-label="Atalhos de filtro">
      {ATALHOS.map(({ id, nome }) => (
        <button
          key={id}
          type="button"
          className={`cart__chip${id === 'atrasadas' ? ' cart__chip--alerta' : ''}`}
          aria-pressed={ativo === id}
          onClick={() => aoEscolher(id)}
        >
          {id === 'atrasadas' && <Warning size={14} weight="bold" aria-hidden="true" />}
          {nome}
          <span className="cart__chip-n">{contagem[id]}</span>
        </button>
      ))}
    </div>
  )
}
