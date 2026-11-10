import '../estilo/global.css'
import { nuvem } from '../nuvem/cliente'
import { useSessao } from '../nuvem/sessao'
import { useMemo } from 'react'
import type { FiltroRegional } from '../dominio/tipos'
import { Carteira } from '../telas/carteira/Carteira'
import { Configuracoes } from '../telas/configuracoes/Configuracoes'
import { Entrada } from '../telas/entrada/Entrada'
import { NovaSenha } from '../telas/entrada/NovaSenha'
import { Casca } from './Casca'
import { SemAcesso } from './SemAcesso'

export function App() {
  const { estado, perfil, entrar, sair, trocarSenha } = useSessao(nuvem)
  const meuId = perfil?.id ?? ''
  // A tela de Configurações precisa saber quem é o admin logado; o wrapper fixa o id sem mudar a Casca.
  const telas = useMemo(
    () => ({
      carteira: ({ regional }: { regional: FiltroRegional }) => <Carteira regional={regional} />,
      configuracoes: () => <Configuracoes meuId={meuId} />,
    }),
    [meuId],
  )

  if (estado === 'carregando') return <div className="carregando" role="status">Carregando...</div>
  if (estado === 'fora' || !perfil) return <Entrada entrar={entrar} />
  if (perfil.papel === 'importador') return <SemAcesso sair={sair} />
  if (perfil.senha_provisoria) return <NovaSenha trocarSenha={trocarSenha} sair={sair} />
  return <Casca perfil={perfil} telas={telas} aoSair={() => void sair()} />
}
