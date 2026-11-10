// Tabela densa da Carteira: linhas virtualizadas, teclado (setas, Enter) e edição na própria linha.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Star, Warning } from '@phosphor-icons/react'
import { corParado, diasParado, ETAPAS, etapaConcluida } from '../../dominio/etapas'
import { formatarBR } from '../../dominio/datas'
import { PRIORIDADES } from '../../dominio/prioridades'
import type { DataISO } from '../../dominio/tipos'
import { situacaoVistoria } from '../../dominio/vistoria'
import type { EditavelLinha, ProjetoLinha } from '../../nuvem/carteira'
import type { Parametros } from '../../nuvem/configuracoes'

export interface Pessoa { id: string; nome: string; ativo: boolean }

interface Props {
  linhas: ProjetoLinha[]
  pessoas: Pessoa[]
  parametros: Parametros
  hoje: DataISO
  /** Projetos com gravação ainda no ar (mostram "Salvando"). */
  salvando: ReadonlySet<string>
  aoMudar: (projeto: string, mudanca: EditavelLinha) => void
  /** Estrela ligada na linha: quem chama pergunta a data e quem pediu antes de gravar. */
  aoPedirGestor: (linha: ProjetoLinha) => void
  /** Com a ficha aberta, Alimentador e Vistoria saem da tabela (estão na ficha). */
  compacta?: boolean
  aoAbrir?: (linha: ProjetoLinha) => void
}

const ALTURA_LINHA = 40
const ALTURA_CABECALHO = 34
// Mesmas larguras no cabeçalho e nas linhas. `largura` é o mínimo; `estica` é o peso (fr) com que a coluna cresce em tela larga. A soma (com folgas) cabe em 1366 px
// sem rolagem horizontal; as colunas de texto cortam com reticências e mostram o valor inteiro no title.
// Projeto, Etapa, Prazo e Parado não cortam.
const TODAS_COLUNAS = [
  { nome: 'Projeto', largura: 96 },
  { nome: 'Prioridade', largura: 108, estica: 1 },
  { nome: 'Município', largura: 92, estica: 1 },
  { nome: 'Defeitos', largura: 56 },
  { nome: 'Alimentador', largura: 76, some: true, estica: 1 },
  { nome: 'Etapa', largura: 170 },
  { nome: 'Próxima ação', largura: 112, estica: 4 },
  { nome: 'Prazo', largura: 172 },
  { nome: 'Vistoria', largura: 112, some: true, estica: 1 },
  { nome: 'Responsável', largura: 104, estica: 1 },
  { nome: 'Parado', largura: 84 },
]
const ESPACO_COLUNAS = 6
const MARGEM_LINHA = 20 // padding lateral da linha (10 + 10)

function montarGrade(compacta: boolean) {
  const colunas = TODAS_COLUNAS.filter((c) => !(compacta && c.some))
  return {
    colunas: colunas.map((c) => c.nome),
    grade: colunas.map((c) => (c.estica ? `minmax(${c.largura}px, ${c.estica}fr)` : `${c.largura}px`)).join(' '),
    largura: colunas.reduce((t, c) => t + c.largura, 0) + ESPACO_COLUNAS * (colunas.length - 1) + MARGEM_LINHA,
  }
}
const ETAPAS_EDITAVEIS = ETAPAS.filter((e) => e !== 'EXECUTADA') // executada só pelo retorno (spec 7)

export function textoVistoria(l: ProjetoLinha, hoje: DataISO, p: Parametros): { texto: string; classe: string } {
  const v = situacaoVistoria(l.vistoria_data, hoje, p)
  switch (v.situacao) {
    case 'sem vistoria': return { texto: 'Sem vistoria', classe: 'cart__v--sem' }
    case 'válida': return { texto: `Válida até ${formatarBR(v.validade!)}`, classe: 'cart__v--ok' }
    case 'vencendo': return { texto: `Vencendo em ${v.diasRestantes} d`, classe: 'cart__v--atencao' }
    default: return { texto: `Vencida há ${-(v.diasRestantes ?? 0)} d`, classe: 'cart__v--ruim' }
  }
}

/** Campo de texto ou data que só grava ao sair do campo ou no Enter; Esc volta ao valor da linha. */
function CampoEditavel(props: {
  tipo: 'text' | 'date'
  valor: string | null
  rotulo: string
  aoGravar: (v: string | null) => void
  classe?: string
}) {
  const { tipo, valor, rotulo, aoGravar, classe } = props
  const [texto, setTexto] = useState(valor ?? '')
  // Enter grava e depois tira o foco: o blur não pode gravar de novo. `enviado` guarda o que já foi mandado
  // até a linha mudar; `descartar` marca o Esc, para o blur seguinte não gravar o que foi digitado.
  const enviado = useRef<string | null | undefined>(undefined)
  const descartar = useRef(false)
  useEffect(() => {
    setTexto(valor ?? '')
    enviado.current = undefined
  }, [valor])
  const gravar = () => {
    if (descartar.current) { descartar.current = false; return }
    const novo = texto.trim() === '' ? null : texto.trim()
    const base = enviado.current !== undefined ? enviado.current : (valor ?? null)
    if (novo === base) return
    enviado.current = novo
    aoGravar(novo)
  }
  return (
    <input
      className={`cart__campo ${classe ?? ''}`}
      type={tipo}
      aria-label={rotulo}
      value={texto}
      placeholder={tipo === 'text' ? 'Definir' : undefined}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={gravar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); gravar(); e.currentTarget.blur() }
        if (e.key === 'Escape') { e.stopPropagation(); descartar.current = true; setTexto(valor ?? ''); e.currentTarget.blur() }
      }}
    />
  )
}

export function TabelaCarteira({ linhas, pessoas, parametros, hoje, salvando, aoMudar, aoPedirGestor, compacta = false, aoAbrir }: Props) {
  const { colunas, grade, largura } = montarGrade(compacta)
  const rolagem = useRef<HTMLDivElement>(null)
  const [ativa, setAtiva] = useState(0)
  const focarAposMover = useRef(false)
  const nomes = new Map(pessoas.map((p) => [p.id, p.nome]))

  const virtual = useVirtualizer({
    count: linhas.length,
    getScrollElement: () => rolagem.current,
    estimateSize: () => ALTURA_LINHA,
    overscan: 8,
    scrollMargin: ALTURA_CABECALHO,
  })

  const indiceAtivo = Math.min(ativa, Math.max(linhas.length - 1, 0))

  useEffect(() => {
    if (!focarAposMover.current) return
    focarAposMover.current = false
    rolagem.current?.querySelector<HTMLElement>(`[data-indice="${indiceAtivo}"]`)?.focus()
  })

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    // Só quando o foco está na própria linha: dentro de um campo, as setas pertencem ao campo.
    if (!(e.target instanceof HTMLElement) || e.target.dataset.indice === undefined) return
    const i = Number(e.target.dataset.indice)
    const salto = Math.max(1, Math.floor((rolagem.current?.clientHeight ?? 400) / ALTURA_LINHA) - 2)
    const alvo =
      e.key === 'ArrowDown' ? i + 1 :
      e.key === 'ArrowUp' ? i - 1 :
      e.key === 'PageDown' ? i + salto :
      e.key === 'PageUp' ? i - salto :
      e.key === 'Home' ? 0 :
      e.key === 'End' ? linhas.length - 1 : null
    if (alvo !== null) {
      e.preventDefault()
      const novo = Math.min(Math.max(alvo, 0), linhas.length - 1)
      focarAposMover.current = true
      setAtiva(novo)
      virtual.scrollToIndex(novo)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      aoAbrir?.(linhas[i])
    }
  }

  return (
    <div
      ref={rolagem}
      className="cart__rolagem"
      role="table"
      aria-label="Carteira de projetos"
      aria-rowcount={linhas.length + 1}
      style={{ '--larg': `${largura}px` } as CSSProperties}
      onKeyDown={aoTeclar}
    >
      <div className="cart__linha cart__linha--cab" role="row" aria-rowindex={1} style={{ gridTemplateColumns: grade, height: ALTURA_CABECALHO }}>
        {colunas.map((c) => <div key={c} role="columnheader" className="cart__cab">{c}</div>)}
      </div>
      <div className="cart__corpo" style={{ height: virtual.getTotalSize() }}>
        {virtual.getVirtualItems().map((item) => {
          const l = linhas[item.index]
          return (
            <Linha
              key={l.projeto}
              l={l}
              indice={item.index}
              ativa={item.index === indiceAtivo}
              y={item.start - ALTURA_CABECALHO}
              pessoas={pessoas}
              nomeResponsavel={l.responsavel ? nomes.get(l.responsavel) : undefined}
              parametros={parametros}
              hoje={hoje}
              salvando={salvando.has(l.projeto)}
              aoMudar={aoMudar}
              aoPedirGestor={aoPedirGestor}
              grade={grade}
              compacta={compacta}
              aoAbrir={aoAbrir}
              aoFocar={() => setAtiva(item.index)}
            />
          )
        })}
      </div>
    </div>
  )
}

function Linha(props: {
  l: ProjetoLinha
  indice: number
  ativa: boolean
  y: number
  pessoas: Pessoa[]
  nomeResponsavel: string | undefined
  parametros: Parametros
  hoje: DataISO
  salvando: boolean
  aoMudar: (projeto: string, mudanca: EditavelLinha) => void
  aoPedirGestor: (linha: ProjetoLinha) => void
  grade: string
  compacta: boolean
  aoAbrir?: (linha: ProjetoLinha) => void
  aoFocar: () => void
}) {
  const { l, indice, ativa, y, pessoas, nomeResponsavel, parametros, hoje, salvando, aoMudar, aoPedirGestor, grade, compacta, aoAbrir, aoFocar } = props
  const concluida = etapaConcluida(l.etapa)
  const atrasada = l.prazo_proxima_acao !== null && l.prazo_proxima_acao < hoje && !concluida
  const vist = textoVistoria(l, hoje, parametros)
  const dias = diasParado(l.etapa_desde, hoje)
  const cor = corParado(dias, parametros)
  // Quem já saiu da lista (ativo = false) continua aparecendo na linha que ele responde.
  const opcoesResp = pessoas.filter((p) => p.ativo || p.id === l.responsavel)

  return (
    <div
      role="row"
      aria-rowindex={indice + 2}
      aria-busy={salvando || undefined}
      data-indice={indice}
      data-projeto={l.projeto}
      tabIndex={ativa ? 0 : -1}
      className={`cart__linha${atrasada ? ' cart__linha--atrasada' : ''}`}
      style={{ gridTemplateColumns: grade, height: ALTURA_LINHA, transform: `translateY(${y}px)` }}
      onFocus={(e) => { if (e.target === e.currentTarget) aoFocar() }}
      onClick={(e) => {
        // Clique em campo, seletor ou botão da linha é da edição; no resto da linha, abre a ficha.
        if ((e.target as HTMLElement).closest('input, select, textarea, button')) return
        aoAbrir?.(l)
      }}
    >
      <div role="cell" className="cart__projeto" title={l.projeto}>
        <span className="cart__projeto-nome">{l.projeto}</span>
        {salvando && <span className="cart__salvando">Salvando</span>}
      </div>
      <div role="cell" className="cart__prioridade">
        <button
          type="button"
          className="cart__gestor"
          aria-pressed={l.pedido_gestor}
          aria-label={`Pedido do gestor de ${l.projeto}`}
          title="Pedido do gestor"
          onClick={() => {
            if (l.pedido_gestor) aoMudar(l.projeto, { pedido_gestor: false, pedido_gestor_em: null, pedido_gestor_por: null })
            else aoPedirGestor(l)
          }}
        >
          <Star size={15} weight={l.pedido_gestor ? 'fill' : 'regular'} aria-hidden="true" />
        </button>
        <span title={l.prioridade === null ? undefined : `${l.prioridade} ${PRIORIDADES[l.prioridade] ?? ''}`}>
          {l.prioridade === null ? 'Sem prioridade' : `${l.prioridade} ${PRIORIDADES[l.prioridade] ?? ''}`}
        </span>
      </div>
      <div role="cell" title={l.municipio ?? undefined}>{l.municipio ?? '-'}</div>
      <div role="cell" className="cart__num">{l.qtd_defeitos}</div>
      {!compacta && (
        <div role="cell" className="cart__mono" title={l.alimentadores.join(', ')}>{l.alimentadores.join(', ') || '-'}</div>
      )}
      <div role="cell">
        {l.etapa === 'EXECUTADA' ? (
          <span className="cart__etapa-fixa">{l.etapa}</span>
        ) : (
          <select
            className="cart__campo cart__etapa"
            aria-label={`Etapa de ${l.projeto}`}
            value={l.etapa}
            onChange={(e) => aoMudar(l.projeto, { etapa: e.target.value as ProjetoLinha['etapa'] })}
          >
            {ETAPAS_EDITAVEIS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        )}
      </div>
      <div role="cell">
        <CampoEditavel tipo="text" valor={l.proxima_acao} rotulo={`Próxima ação de ${l.projeto}`}
          aoGravar={(v) => aoMudar(l.projeto, { proxima_acao: v })} />
      </div>
      <div role="cell" className={atrasada ? 'cart__prazo cart__prazo--atrasado' : 'cart__prazo'}>
        {atrasada && (
          <span className="cart__atrasada"><Warning size={14} weight="bold" aria-hidden="true" />Atrasada</span>
        )}
        <CampoEditavel tipo="date" valor={l.prazo_proxima_acao} rotulo={`Prazo de ${l.projeto}`}
          aoGravar={(v) => aoMudar(l.projeto, { prazo_proxima_acao: v })} classe="cart__data" />
      </div>
      {!compacta && <div role="cell" className={`cart__vistoria ${vist.classe}`} title={vist.texto}>{vist.texto}</div>}
      <div role="cell">
        <select
          className="cart__campo"
          aria-label={`Responsável por ${l.projeto}`}
          title={l.responsavel ? nomeResponsavel : undefined}
          value={l.responsavel ?? ''}
          onChange={(e) => aoMudar(l.projeto, { responsavel: e.target.value === '' ? null : e.target.value })}
        >
          <option value="">Sem responsável</option>
          {opcoesResp.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          {l.responsavel && nomeResponsavel === undefined && <option value={l.responsavel}>Pessoa removida</option>}
        </select>
      </div>
      <div role="cell" className={`cart__parado cart__parado--${concluida ? 'normal' : cor}`}
        title={concluida ? undefined : `Parado na etapa há ${dias} dias`}>
        {concluida ? '-' : (
          <>
            {dias} d
            {cor !== 'normal' && <small className="cart__parado-nivel">{cor === 'vermelho' ? 'crítico' : 'atenção'}</small>}
          </>
        )}
      </div>
    </div>
  )
}
