// Quadro do pedido do gestor: pede a data e quem pediu. Serve para marcar na linha e para editar na ficha.
import { useState } from 'react'
import type { DataISO } from '../../dominio/tipos'
import { Quadro } from './Quadro'

export interface DadosPedido { em: DataISO; por: string }

interface Props {
  projeto: string
  /** Valores atuais, quando o pedido já existe (edição). */
  inicial: { em: DataISO | null; por: string | null } | null
  hoje: DataISO
  aoConfirmar: (d: DadosPedido) => void
  aoCancelar: () => void
}

export function PedidoGestor({ projeto, inicial, hoje, aoConfirmar, aoCancelar }: Props) {
  const [em, setEm] = useState<string>(inicial?.em ?? hoje)
  const [por, setPor] = useState(inicial?.por ?? '')
  const [erro, setErro] = useState<string | null>(null)

  function confirmar(e: React.FormEvent) {
    e.preventDefault()
    if (em === '') return setErro('Diga a data do pedido.')
    if (por.trim() === '') return setErro('Diga quem pediu o projeto.')
    aoConfirmar({ em, por: por.trim() })
  }

  return (
    <Quadro titulo={`Pedido do gestor de ${projeto}`} aoFechar={aoCancelar}>
      <form className="quadro__corpo" onSubmit={confirmar} noValidate>
        <label className="quadro__campo">
          <span>Quem pediu</span>
          <input type="text" value={por} onChange={(e) => setPor(e.target.value)} autoComplete="off" />
        </label>
        <label className="quadro__campo">
          <span>Data do pedido</span>
          <input type="date" value={em} max={hoje} onChange={(e) => setEm(e.target.value)} />
        </label>
        {erro && <p className="cfg__erro" role="alert">{erro}</p>}
        <div className="quadro__acoes">
          <button type="button" className="cfg__botao" onClick={aoCancelar}>Cancelar</button>
          <button type="submit" className="cfg__botao cfg__botao--forte">Marcar pedido</button>
        </div>
      </form>
    </Quadro>
  )
}
