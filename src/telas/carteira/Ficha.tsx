// Ficha do projeto: painel ao lado da tabela da Carteira. Leitura, menos o pedido do gestor (edita aqui).
import { useEffect, useState, type ReactNode } from 'react'
import { MapPin, Star, WarningCircle, X } from '@phosphor-icons/react'
import { formatarBR, hojeEmFortaleza } from '../../dominio/datas'
import { corParado, diasParado, etapaConcluida } from '../../dominio/etapas'
import { PRIORIDADES } from '../../dominio/prioridades'
import type { DataISO } from '../../dominio/tipos'
import { carregarFicha, type FichaProjeto, type ProjetoLinha } from '../../nuvem/carteira'
import { nuvem } from '../../nuvem/cliente'
import type { Parametros } from '../../nuvem/configuracoes'
import { mensagemDeErro } from '../../nuvem/erros'
import { mudancasDeCampo } from './mudancas'
import { textoVistoria, type Pessoa } from './TabelaCarteira'

export type AcaoPedido = 'marcar' | 'editar' | 'tirar'

interface Props {
  /** A linha como está na tabela agora (com as mudanças otimistas). */
  linha: ProjetoLinha
  pessoas: Pessoa[]
  parametros: Parametros
  hoje: DataISO
  aoFechar: () => void
  aoPedidoGestor: (acao: AcaoPedido) => void
}

type Carga = { projeto: string; ficha: FichaProjeto } | { projeto: string; erro: string }

const vazio = (v: ReactNode) => (v === null || v === undefined || v === '' ? '-' : v)

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <>
      <dt>{rotulo}</dt>
      <dd>{vazio(children)}</dd>
    </>
  )
}

export function Ficha({ linha, pessoas, parametros, hoje, aoFechar, aoPedidoGestor }: Props) {
  const projeto = linha.projeto
  const [carga, setCarga] = useState<Carga | null>(null)
  const [tentativa, setTentativa] = useState(0)

  // Recarrega quando a linha muda no banco (atualizado_em novo), para o histórico e os dados acompanharem.
  useEffect(() => {
    if (!nuvem) return
    let vivo = true
    carregarFicha(nuvem, projeto)
      .then((ficha) => { if (vivo) setCarga({ projeto, ficha }) })
      .catch((e) => { if (vivo) setCarga({ projeto, erro: mensagemDeErro(e) }) })
    return () => { vivo = false }
  }, [projeto, linha.atualizado_em, tentativa])

  const nomes = new Map(pessoas.map((p) => [p.id, p.nome]))
  const atual = carga && carga.projeto === projeto ? carga : null
  const ficha = atual && 'ficha' in atual ? atual.ficha : null
  const erro = atual && 'erro' in atual ? atual.erro : null

  const concluida = etapaConcluida(linha.etapa)
  const dias = diasParado(linha.etapa_desde, hoje)
  const cor = corParado(dias, parametros)

  return (
    <aside className="ficha" aria-label={`Ficha do projeto ${projeto}`}>
      <header className="ficha__topo">
        <div className="ficha__linha-topo">
          <span className="ficha__rotulo">Ficha do projeto</span>
          <button type="button" className="ficha__fechar" aria-label="Fechar ficha" title="Fechar (Esc)" onClick={aoFechar}>
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>
        <h2 className="ficha__projeto">{projeto}</h2>
        <p className="ficha__resumo">
          <b>{linha.municipio ?? 'Sem município'}</b>
          {linha.alimentadores.length > 0 && <span className="ficha__mono">{linha.alimentadores.join(', ')}</span>}
          <span>
            {linha.prioridade === null ? 'Sem prioridade' : `Prioridade ${linha.prioridade} ${PRIORIDADES[linha.prioridade] ?? ''}`}
          </span>
          <span>{linha.qtd_defeitos} {linha.qtd_defeitos === 1 ? 'defeito' : 'defeitos'}</span>
        </p>
        <p className="ficha__etapa">
          <span className="ficha__etapa-nome">{linha.etapa}</span>
          {!concluida && (
            <span className={`ficha__parado ficha__parado--${cor}`}>
              há {dias} {dias === 1 ? 'dia' : 'dias'}
              {cor !== 'normal' && ` (${cor === 'vermelho' ? 'crítico' : 'atenção'})`}
            </span>
          )}
        </p>
        <div className="ficha__acoes">
          <button type="button" className="cfg__botao cfg__botao--p" disabled title="Chega no plano 4">
            <MapPin size={15} aria-hidden="true" />
            Ver no mapa
          </button>
          {linha.pedido_gestor ? (
            <span className="ficha__pedido">
              <Star size={15} weight="fill" aria-hidden="true" />
              <span>
                Pedido de {linha.pedido_gestor_por ?? 'quem não foi anotado'}
                {linha.pedido_gestor_em ? ` em ${formatarBR(linha.pedido_gestor_em)}` : ''}
              </span>
              <button type="button" className="ficha__link" aria-label="Editar o pedido do gestor" onClick={() => aoPedidoGestor('editar')}>Editar</button>
              <button type="button" className="ficha__link" aria-label="Tirar o pedido do gestor" onClick={() => aoPedidoGestor('tirar')}>Tirar</button>
            </span>
          ) : (
            <button type="button" className="cfg__botao cfg__botao--p" aria-label="Marcar pedido do gestor" onClick={() => aoPedidoGestor('marcar')}>
              <Star size={15} aria-hidden="true" />
              Pedido do gestor
            </button>
          )}
        </div>
      </header>

      <div className="ficha__corpo" role="region" aria-label={`Detalhes do projeto ${projeto}`} tabIndex={0}>
        {erro && (
          <div className="ficha__estado">
            <p className="cfg__erro" role="alert"><WarningCircle size={18} weight="bold" aria-hidden="true" />{erro}</p>
            <button type="button" className="cfg__botao cfg__botao--p" onClick={() => { setCarga(null); setTentativa((t) => t + 1) }}>Tentar de novo</button>
          </div>
        )}
        {!erro && !ficha && <p className="cfg__vazio" role="status">Carregando a ficha...</p>}
        {ficha && <Detalhes ficha={ficha} linha={linha} nomes={nomes} parametros={parametros} hoje={hoje} />}
      </div>
    </aside>
  )
}

function Detalhes({ ficha, linha, nomes, parametros, hoje }: {
  ficha: FichaProjeto
  linha: ProjetoLinha
  nomes: Map<string, string>
  parametros: Parametros
  hoje: DataISO
}) {
  const p = ficha.projeto
  const vist = textoVistoria(linha, hoje, parametros)
  const responsavel = linha.responsavel ? (nomes.get(linha.responsavel) ?? 'Pessoa removida') : null

  const registros = ficha.historico
    .map((h) => {
      const quem = h.quem === '' ? 'Sistema' : (nomes.get(h.quem) ?? 'Pessoa removida')
      const quando = formatarBR(hojeEmFortaleza(new Date(h.quando)))
      const criou = Object.keys(h.antes).length === 0 && Object.keys(h.depois).length > 0
      const removeu = Object.keys(h.depois).length === 0 && Object.keys(h.antes).length > 0
      const linhas = criou ? ['Projeto criado'] : removeu ? ['Projeto removido'] : mudancasDeCampo(h.antes, h.depois)
      return { h, quem, quando, linhas }
    })
    .filter((r) => r.linhas.length > 0)

  return (
    <>
      <section className="ficha__secao">
        <h3>Dados</h3>
        <dl className="ficha__dl">
          <Linha rotulo="Origem">{p.origem === 'manual' ? 'Cadastrado à mão' : 'Importação da Enel'}</Linha>
          <Linha rotulo="OT de correção"><span className="ficha__mono">{p.ot_correcao}</span></Linha>
          <Linha rotulo="Endereço">{p.endereco}</Linha>
          <Linha rotulo="Elemento de corte"><span className="ficha__mono">{p.elemento_corte}</span></Linha>
          <Linha rotulo="Clientes">{p.qtd_clientes}</Linha>
          <Linha rotulo="Estruturas">{p.estruturas.length > 0 ? p.estruturas.join(', ') : null}</Linha>
          <Linha rotulo="Intervenção prevista">{p.intervencao_prevista}</Linha>
          <Linha rotulo="Próxima ação">
            {linha.proxima_acao}
            {linha.proxima_acao && linha.prazo_proxima_acao ? `, até ${formatarBR(linha.prazo_proxima_acao)}` : null}
          </Linha>
          <Linha rotulo="Responsável">{responsavel}</Linha>
        </dl>
      </section>

      <section className="ficha__secao">
        <h3>Vistoria</h3>
        <dl className="ficha__dl">
          <Linha rotulo="Situação"><span className={`ficha__vistoria ${vist.classe}`}>{vist.texto}</span></Linha>
          <Linha rotulo="Feita em">{linha.vistoria_data ? formatarBR(linha.vistoria_data) : null}</Linha>
          <Linha rotulo="Enviada em">{p.vistoria_enviada_em ? formatarBR(p.vistoria_enviada_em) : null}</Linha>
          <Linha rotulo="Resultado">{p.vistoria_situacao}</Linha>
          <Linha rotulo="Recurso">{p.vistoria_recurso}</Linha>
          <Linha rotulo="Intervenção">{p.vistoria_intervencao}</Linha>
          <Linha rotulo="Observação">{p.vistoria_observacao}</Linha>
        </dl>
      </section>

      <section className="ficha__secao">
        <h3>Defeitos <small>{ficha.defeitos.length}</small></h3>
        {ficha.defeitos.length === 0 ? (
          <p className="ficha__nota">
            {linha.qtd_defeitos > 0
              ? `Sem ID GOM cadastrado. A quantidade informada é ${linha.qtd_defeitos}.`
              : 'Nenhum defeito cadastrado.'}
          </p>
        ) : (
          <ul className="ficha__defeitos">
            {ficha.defeitos.map((d) => (
              <li key={d.id_gom}>
                <span className="ficha__mono ficha__gom">{d.id_gom}</span>
                <span className="ficha__defeito-info">
                  {[d.estrutura, d.alimentador, d.prioridade !== null ? `prioridade ${d.prioridade}` : null].filter(Boolean).join(', ') || '-'}
                </span>
                <span className={`ficha__situacao ficha__situacao--${d.situacao}`}>{d.situacao}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ficha__secao">
        <h3>Programações e retornos</h3>
        <p className="ficha__nota">Chega no plano 3.</p>
      </section>

      <section className="ficha__secao">
        <h3>Histórico</h3>
        {registros.length === 0 ? (
          <p className="ficha__nota">Nenhuma mudança registrada.</p>
        ) : (
          <ol className="ficha__historico">
            {registros.map((r, i) => (
              <li key={`${r.h.quando}-${i}`}>
                <span className="ficha__quando">{r.quando}</span>
                <div>
                  <b>{r.quem}</b>
                  {r.linhas.map((l) => <span key={l} className="ficha__mudanca">{l}</span>)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}
