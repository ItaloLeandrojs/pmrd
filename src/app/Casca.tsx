// Casca do app: menu, barra do topo com o seletor de regional, e a tela ativa.
import { useCallback, useEffect, useState, type ComponentType } from 'react'
import type { FiltroRegional, Regional, Tema } from '../dominio/tipos'
import { nuvem } from '../nuvem/cliente'
import { guardarPreferencias, type Perfil } from '../nuvem/perfil'
import { EmConstrucao } from './EmConstrucao'
import { Menu } from './Menu'
import { lerRota, regionalEfetiva, telasVisiveis, type IdTela } from './rotas'
import { SeletorRegional } from './SeletorRegional'
import { alternarTema, aplicarTema, seguirSistema, temaEfetivo } from './Tema'

interface Props {
  perfil: Perfil
  telas: Partial<Record<IdTela, ComponentType<{ regional: FiltroRegional }>>>
  aoSair?: () => void
}

const CHAVE_ULTIMA = 'pmrd.ultimaRegionalUnica'

function lerUltimaUnica(inicial: FiltroRegional): Regional {
  try {
    const v = localStorage.getItem(CHAVE_ULTIMA)
    if (v === 'CS' || v === 'SUL' || v === 'LESTE') return v
  } catch { /* sem armazenamento: segue sem lembrar */ }
  return inicial === 'SUL' || inicial === 'LESTE' ? inicial : 'CS'
}

function lembrarUltimaUnica(r: Regional): void {
  try { localStorage.setItem(CHAVE_ULTIMA, r) } catch { /* só conveniência */ }
}

export function Casca({ perfil, telas, aoSair }: Props) {
  const [rota, setRota] = useState<IdTela>(() => lerRota(window.location.hash))
  const [regional, setRegional] = useState<FiltroRegional>(perfil.regional_preferida)
  const [ultimaUnica, setUltimaUnica] = useState<Regional>(() => lerUltimaUnica(perfil.regional_preferida))
  const [tema, setTema] = useState<Tema>(perfil.tema)

  useEffect(() => {
    const ao = () => setRota(lerRota(window.location.hash))
    window.addEventListener('hashchange', ao)
    return () => window.removeEventListener('hashchange', ao)
  }, [])

  useEffect(() => {
    aplicarTema(tema)
    return seguirSistema(tema)
  }, [tema])

  const guardar = useCallback((r: FiltroRegional, t: Tema) => {
    if (!nuvem) return
    guardarPreferencias(nuvem, r, t).catch(() => { /* preferência é conveniência: a tela já mudou */ })
  }, [])

  const escolherRegional = (r: FiltroRegional) => {
    setRegional(r)
    if (r !== 'TODAS') {
      setUltimaUnica(r)
      lembrarUltimaUnica(r)
    }
    guardar(r, tema)
  }

  const trocarTema = () => {
    const novo = alternarTema(tema)
    setTema(novo)
    guardar(regional, novo)
  }

  // Tela fora do alcance do papel (equipe em #/configuracoes) cai em Hoje.
  const visiveis = telasVisiveis(perfil.papel)
  const tela = visiveis.find((t) => t.id === rota) ?? visiveis[0]
  const regionalDaTela = regionalEfetiva(tela, regional, ultimaUnica)
  const Conteudo = telas[tela.id]

  return (
    <div className="casca">
      <Menu
        papel={perfil.papel}
        ativa={tela.id}
        nome={perfil.nome || perfil.email}
        temaAtual={temaEfetivo(tema)}
        aoTrocarTema={trocarTema}
        aoSair={aoSair}
      />
      <div className="casca__corpo">
        <header className="topo">
          <h1 className="topo__titulo">{tela.nome}</h1>
          <SeletorRegional valor={regionalDaTela} aceitaTodas={tela.aceitaTodas} aoEscolher={escolherRegional} />
        </header>
        <main className="casca__tela">
          {Conteudo ? <Conteudo regional={regionalDaTela} /> : (
            <EmConstrucao nome={tela.nome} plano={tela.plano > 1 ? tela.plano : undefined} />
          )}
        </main>
      </div>
    </div>
  )
}
