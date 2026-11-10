// Configurações do administrador: cinco abas (equipes, solicitantes, motivos, prazos, usuários).
import { useRef, useState, type KeyboardEvent } from 'react'
import type { FiltroRegional } from '../../dominio/tipos'
import { nuvem } from '../../nuvem/cliente'
import { Equipes } from './Equipes'
import { Motivos } from './Motivos'
import { Prazos } from './Prazos'
import { Solicitantes } from './Solicitantes'
import { Usuarios } from './Usuarios'

type IdAba = 'equipes' | 'solicitantes' | 'motivos' | 'prazos' | 'usuarios'

const ABAS: { id: IdAba; nome: string }[] = [
  { id: 'equipes', nome: 'Equipes' },
  { id: 'solicitantes', nome: 'Solicitantes de SGD' },
  { id: 'motivos', nome: 'Motivos' },
  { id: 'prazos', nome: 'Prazos' },
  { id: 'usuarios', nome: 'Usuários' },
]

interface Props {
  /** A Casca passa a regional; a tela não usa (configuração vale para todas). */
  regional?: FiltroRegional
  /** Id do administrador logado: a própria linha não pode se desativar nem se rebaixar. */
  meuId: string
}

export function Configuracoes({ meuId }: Props) {
  const [aba, setAba] = useState<IdAba>('equipes')
  const botoes = useRef<Record<string, HTMLButtonElement | null>>({})

  function teclas(e: KeyboardEvent, i: number) {
    let j = i
    if (e.key === 'ArrowRight') j = (i + 1) % ABAS.length
    else if (e.key === 'ArrowLeft') j = (i - 1 + ABAS.length) % ABAS.length
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = ABAS.length - 1
    else return
    e.preventDefault()
    setAba(ABAS[j].id)
    botoes.current[ABAS[j].id]?.focus()
  }

  if (!nuvem) return <p className="cfg__vazio" role="alert">Sem conexão com o banco neste ambiente.</p>

  return (
    <div className="cfg">
      <div className="cfg__abas" role="tablist" aria-label="Configurações">
        {ABAS.map((a, i) => (
          <button
            key={a.id}
            ref={(el) => { botoes.current[a.id] = el }}
            type="button"
            role="tab"
            id={`cfg-aba-${a.id}`}
            aria-selected={aba === a.id}
            aria-controls={`cfg-painel-${a.id}`}
            tabIndex={aba === a.id ? 0 : -1}
            className="cfg__aba"
            onClick={() => setAba(a.id)}
            onKeyDown={(e) => teclas(e, i)}
          >
            {a.nome}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`cfg-painel-${aba}`} aria-labelledby={`cfg-aba-${aba}`} className="cfg__painel">
        {aba === 'equipes' && <Equipes c={nuvem} />}
        {aba === 'solicitantes' && <Solicitantes c={nuvem} />}
        {aba === 'motivos' && <Motivos c={nuvem} />}
        {aba === 'prazos' && <Prazos c={nuvem} />}
        {aba === 'usuarios' && <Usuarios c={nuvem} meuId={meuId} />}
      </div>
    </div>
  )
}
