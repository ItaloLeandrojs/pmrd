// CS | Sul | Leste | Todas, fixo no alto. "Todas" fica desligada nas telas que mostram uma regional por vez.
import type { FiltroRegional } from '../dominio/tipos'

const OPCOES: { valor: FiltroRegional; nome: string }[] = [
  { valor: 'CS', nome: 'CS' },
  { valor: 'SUL', nome: 'Sul' },
  { valor: 'LESTE', nome: 'Leste' },
  { valor: 'TODAS', nome: 'Todas' },
]

const DICA = 'Esta tela mostra uma regional por vez'

interface Props {
  valor: FiltroRegional
  aceitaTodas: boolean
  aoEscolher: (r: FiltroRegional) => void
}

export function SeletorRegional({ valor, aceitaTodas, aoEscolher }: Props) {
  return (
    <div className="seg" role="group" aria-label="Regional">
      {OPCOES.map((o) => {
        const desligada = o.valor === 'TODAS' && !aceitaTodas
        return (
          <button
            key={o.valor}
            type="button"
            className={`seg__op${desligada ? ' seg__op--off' : ''}`}
            aria-pressed={valor === o.valor}
            aria-disabled={desligada ? 'true' : undefined}
            aria-label={desligada ? `${o.nome} (${DICA})` : o.nome}
            title={desligada ? DICA : undefined}
            onClick={() => { if (!desligada) aoEscolher(o.valor) }}
          >
            {o.nome}
          </button>
        )
      })}
    </div>
  )
}
