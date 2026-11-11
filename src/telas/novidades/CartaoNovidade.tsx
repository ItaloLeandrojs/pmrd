// Um cartão da fila de novidades: o que a Enel mudou num projeto e, para o administrador, as decisões possíveis.
import type { ReactNode } from 'react'
import type { InfoProjeto, Novidade } from '../../nuvem/novidades'
import {
  NOME_REGIONAL, dadosCorrigido, dadosMudou, dadosNovo, resumoDaNovidade, textoPrioridade, type DefeitoEnel,
} from './resumo'

/** Uma decisão: aceitar (com a escolha que a função do banco pede) ou recusar. */
export type Decisao = { acao: 'aceitar'; escolha?: string; rotulo: string } | { acao: 'recusar'; rotulo: string }

const RECUSAR: Decisao = { acao: 'recusar', rotulo: 'Recusar' }

/** Botões por tipo, na ordem em que aparecem. Saíram e Corrigidos não têm Aceitar sem escolha. */
export function decisoesDo(tipo: Novidade['tipo']): Decisao[] {
  if (tipo === 'saiu') {
    return [
      { acao: 'aceitar', escolha: 'MANTER', rotulo: 'Manter na carteira' },
      { acao: 'aceitar', escolha: 'TRANSFERIDA', rotulo: 'Transferida' },
      { acao: 'aceitar', escolha: 'NÃO EXECUTÁVEL', rotulo: 'Não executável' },
      RECUSAR,
    ]
  }
  if (tipo === 'corrigido') {
    return [
      { acao: 'aceitar', escolha: 'EXECUTADO', rotulo: 'Dar como executado' },
      { acao: 'aceitar', escolha: 'TIRAR', rotulo: 'Tirar do projeto' },
      RECUSAR,
    ]
  }
  return [{ acao: 'aceitar', rotulo: 'Aceitar' }, RECUSAR]
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

interface Props {
  novidade: Novidade
  /** Como o projeto está hoje na carteira (mudou, saiu, corrigido). */
  info: InfoProjeto | undefined
  admin: boolean
  selecionavel: boolean
  selecionada: boolean
  aoSelecionar: (marcada: boolean) => void
  /** Rótulo do botão deste cartão que está gravando, se houver. */
  salvando: string | null
  /** Alguma gravação em andamento na tela: as outras decisões esperam. */
  ocupado: boolean
  aoDecidir: (d: Decisao) => void
}

export function CartaoNovidade({ novidade: n, info, admin, selecionavel, selecionada, aoSelecionar, salvando, ocupado, aoDecidir }: Props) {
  const novo = n.tipo === 'novo' ? dadosNovo(n) : null
  const municipio = novo ? novo.municipio : (info?.municipio ?? null)

  return (
    <li className="nov__item">
      <article className={`nov__cartao${admin ? ' nov__cartao--admin' : ''}`} aria-label={n.projeto}>
        {admin && selecionavel && (
          <input
            type="checkbox"
            className="nov__marca"
            aria-label={`Selecionar ${n.projeto}`}
            checked={selecionada}
            onChange={(e) => aoSelecionar(e.target.checked)}
          />
        )}
        <div className="nov__info">
          <p className="nov__topo">
            <span className="nov__projeto">{n.projeto}</span>
            <span className="nov__regional">{NOME_REGIONAL[n.regional]}</span>
          </p>
          <p className="nov__resumo">{resumoDaNovidade(n)}</p>
          <p className="nov__meta">
            <span>{municipio ?? 'Sem município'}</span>
            {novo && novo.alimentadores.length > 0 && <span className="nov__mono">{novo.alimentadores.join(', ')}</span>}
            {!novo && info && <span>Etapa {info.etapa}</span>}
            {!novo && info && <span>{maiuscula(textoPrioridade(info.prioridade))}</span>}
            {!novo && !info && <span className="nov__fora">Fora da carteira desta regional</span>}
          </p>
          <Defeitos novidade={n} />
        </div>
        {admin && (
          <div className="nov__acoes" role="group" aria-label={`Decisão sobre ${n.projeto}`}>
            {decisoesDo(n.tipo).map((d, i) => (
              <button
                key={d.rotulo}
                type="button"
                className={`cfg__botao cfg__botao--p${i === 0 ? ' cfg__botao--forte' : ''}`}
                aria-disabled={ocupado ? 'true' : undefined}
                onClick={() => { if (!ocupado) aoDecidir(d) }}
              >
                {salvando === d.rotulo ? 'Salvando...' : d.rotulo}
              </button>
            ))}
          </div>
        )}
      </article>
    </li>
  )
}

function infoDefeito(d: DefeitoEnel): string {
  const p = typeof d.prioridade === 'number' ? `prioridade ${d.prioridade}` : null
  return [d.estrutura, d.alimentador, p].filter(Boolean).join(', ') || '-'
}

function ListaDefeitos({ itens }: { itens: { id: string; info: string }[] }) {
  return (
    <ul className="nov__defeitos">
      {itens.map((x) => (
        <li key={x.id}>
          <span className="nov__mono nov__gom">{x.id}</span>
          <span>{x.info}</span>
        </li>
      ))}
    </ul>
  )
}

/** Os defeitos da novidade, recolhidos: abrem só quando o administrador quer conferir antes de decidir. */
function Defeitos({ novidade: n }: { novidade: Novidade }) {
  let corpo: ReactNode = null
  if (n.tipo === 'novo') {
    const d = dadosNovo(n)
    if (d.defeitos.length === 0) return null
    corpo = <ListaDefeitos itens={d.defeitos.map((x) => ({ id: x.id_gom, info: infoDefeito(x) }))} />
  } else if (n.tipo === 'mudou') {
    const d = dadosMudou(n)
    if (d.entram.length === 0 && d.saem.length === 0) return null
    corpo = (
      <>
        {d.entram.length > 0 && <p className="nov__sub">Entram</p>}
        {d.entram.length > 0 && <ListaDefeitos itens={d.entram.map((x) => ({ id: x.id_gom, info: infoDefeito(x) }))} />}
        {d.saem.length > 0 && <p className="nov__sub">Saem</p>}
        {d.saem.length > 0 && <ListaDefeitos itens={d.saem.map((id) => ({ id, info: 'não está mais ativo na Enel' }))} />}
      </>
    )
  } else if (n.tipo === 'corrigido') {
    const d = dadosCorrigido(n)
    if (d.defeitos.length === 0) return null
    corpo = <ListaDefeitos itens={d.defeitos.map((x) => ({ id: x.id_gom, info: x.estado_enel ?? 'sem estado' }))} />
  } else {
    return null
  }
  return (
    <details className="nov__detalhes">
      <summary>Ver defeitos</summary>
      {corpo}
    </details>
  )
}
