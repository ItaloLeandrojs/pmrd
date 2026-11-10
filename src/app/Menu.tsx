// Menu fino de ícones à esquerda: petróleo escuro em vidro, nome da tela na dica e no aria-label.
import { MoonStars, SignOut, Sun } from '@phosphor-icons/react'
import type { Papel } from '../dominio/tipos'
import { IconeP } from '../marca/IconeP'
import { telasVisiveis, type IdTela, type Tela } from './rotas'

interface Props {
  papel: Papel
  ativa: IdTela
  nome: string
  temaAtual: 'claro' | 'escuro'
  aoTrocarTema: () => void
  aoSair?: () => void
}

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return '?'
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

export function Menu({ papel, ativa, nome, temaAtual, aoTrocarTema, aoSair }: Props) {
  const telas = telasVisiveis(papel)
  const item = (t: Tela) => {
    const Icone = t.icone
    const on = t.id === ativa
    return (
      <a
        key={t.id}
        href={`#/${t.id}`}
        className={`menu__item${on ? ' menu__item--on' : ''}`}
        aria-label={t.nome}
        aria-current={on ? 'page' : undefined}
        data-dica={t.nome}
      >
        <Icone size={20} weight={on ? 'fill' : 'regular'} aria-hidden="true" />
      </a>
    )
  }
  return (
    <nav className="menu" aria-label="Menu principal">
      <span className="menu__marca"><IconeP tamanho={34} /></span>
      {telas.filter((t) => t.grupo === 'principal').map(item)}
      <span className="menu__sep" aria-hidden="true" />
      {telas.filter((t) => t.grupo === 'apoio').map(item)}
      <div className="menu__fim">
        <button
          type="button"
          className="menu__item"
          aria-label="Trocar tema"
          data-dica={temaAtual === 'escuro' ? 'Tema claro' : 'Tema escuro'}
          onClick={aoTrocarTema}
        >
          {temaAtual === 'escuro' ? <Sun size={20} aria-hidden="true" /> : <MoonStars size={20} aria-hidden="true" />}
        </button>
        {aoSair && (
          <button type="button" className="menu__item" aria-label="Sair" data-dica="Sair" onClick={aoSair}>
            <SignOut size={20} aria-hidden="true" />
          </button>
        )}
        <span className="menu__avatar" title={nome} aria-hidden="true">{iniciais(nome)}</span>
      </div>
    </nav>
  )
}
