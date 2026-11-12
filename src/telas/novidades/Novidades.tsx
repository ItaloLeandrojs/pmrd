// Tela Novidades da Enel: a última leitura de cada regional, a fila por tipo e, para o administrador, aceitar ou recusar.
// O cartão só some quando o banco confirma (sem gravação otimista) e uma gravação acontece por vez.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CheckCircle, Info, Warning, WarningCircle, X } from '@phosphor-icons/react'
import type { FiltroRegional, Papel } from '../../dominio/tipos'
import { nuvem } from '../../nuvem/cliente'
import { mensagemDeErro } from '../../nuvem/erros'
import {
  REGIONAIS, aceitarEmLote, aceitarNovidade, infoDosProjetos, listarNovidades, recusarNovidade, ultimasImportacoes,
  type InfoProjeto, type Novidade, type TipoNovidade, type UltimaImportacao,
} from '../../nuvem/novidades'
import { CartaoNovidade, type Decisao } from './CartaoNovidade'
import { avisosDe, textoImportacao, type NivelImportacao } from './resumo'

interface Props {
  regional: FiltroRegional
  papel: Papel
  /** Só para testes: fixa o relógio. Em uso normal, a hora do navegador. */
  agora?: Date
}

interface Carga { novidades: Novidade[]; importacoes: UltimaImportacao[]; info: Map<string, InfoProjeto> }

const ABAS: { id: TipoNovidade; nome: string }[] = [
  { id: 'novo', nome: 'Novos' },
  { id: 'mudou', nome: 'Mudaram' },
  { id: 'saiu', nome: 'Saíram' },
  { id: 'corrigido', nome: 'Corrigidos na Enel' },
]

const JA_DECIDIDA = 'Esta novidade já foi decidida.'

export function Novidades({ regional, papel, agora }: Props) {
  const [carga, setCarga] = useState<Carga | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (!nuvem) return
    const c = nuvem
    let vivo = true
    setCarga(null)
    setErro(null)
    Promise.all([listarNovidades(c, regional), ultimasImportacoes(c)])
      .then(async ([novidades, importacoes]) => {
        const naCarteira = novidades.filter((n) => n.tipo !== 'novo').map((n) => n.projeto)
        const info = await infoDosProjetos(c, naCarteira)
        if (vivo) setCarga({ novidades, importacoes, info })
      })
      .catch((e) => { if (vivo) setErro(mensagemDeErro(e)) })
    return () => { vivo = false }
  }, [regional, tentativa])

  if (!nuvem) return <p className="cfg__vazio" role="alert">Sem conexão com o banco neste ambiente.</p>
  if (erro) {
    return (
      <div className="cart__estado">
        <p className="cfg__erro" role="alert"><WarningCircle size={18} weight="bold" aria-hidden="true" />{erro}</p>
        <button type="button" className="cfg__botao" onClick={() => setTentativa((t) => t + 1)}>Tentar de novo</button>
      </div>
    )
  }
  if (!carga) return <p className="cfg__vazio" role="status">Carregando as novidades...</p>
  return <NovidadesCarregadas key={`${regional}-${tentativa}`} regional={regional} papel={papel} agora={agora} carga={carga} />
}

const ICONE: Record<NivelImportacao, typeof CheckCircle> = { ok: CheckCircle, velha: Warning, erro: WarningCircle, nenhuma: Info }

function FaixaImportacoes({ regional, importacoes, agora }: { regional: FiltroRegional; importacoes: UltimaImportacao[]; agora: Date }) {
  const regionais = regional === 'TODAS' ? REGIONAIS : [regional]
  return (
    <ul className="nov__faixa" aria-label="Última leitura da demanda por regional">
      {regionais.map((r) => {
        const imp = importacoes.find((i) => i.regional === r)
        const t = textoImportacao(r, imp, agora)
        const avisos = t.nivel === 'erro' ? [] : avisosDe(imp)
        const Icone = ICONE[t.nivel]
        return (
          <li key={r} className={`nov__imp nov__imp--${t.nivel}`}>
            <p className="nov__imp-linha">
              <Icone size={16} weight="bold" aria-hidden="true" />
              <span>{t.texto}</span>
            </p>
            {t.detalhe && <p className="nov__imp-erro">{t.detalhe}</p>}
            {avisos.length > 0 && (
              <details className="nov__avisos">
                <summary>{avisos.length} {avisos.length === 1 ? 'aviso' : 'avisos'}</summary>
                <ul>{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </details>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function NovidadesCarregadas({ regional, papel, agora: agoraFixo, carga }: Props & { carga: Carga }) {
  const c = nuvem!
  const admin = papel === 'admin'
  const agora = useMemo(() => agoraFixo ?? new Date(), [agoraFixo])
  const [lista, setLista] = useState(carga.novidades)
  const [info, setInfo] = useState(carga.info)
  const [aba, setAba] = useState<TipoNovidade>(() => ABAS.find((a) => carga.novidades.some((n) => n.tipo === a.id))?.id ?? 'novo')
  const [marcadas, setMarcadas] = useState<Set<number>>(() => new Set())
  const [salvando, setSalvando] = useState<{ id: number | 'lote'; rotulo: string } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [feito, setFeito] = useState('')
  const ocupado = useRef(false)
  const botoes = useRef<Record<string, HTMLButtonElement | null>>({})
  const painel = useRef<HTMLDivElement | null>(null)

  const contagem = useMemo(() => {
    const n: Record<TipoNovidade, number> = { novo: 0, mudou: 0, saiu: 0, corrigido: 0 }
    for (const x of lista) n[x.tipo]++
    return n
  }, [lista])
  const daAba = useMemo(() => lista.filter((n) => n.tipo === aba), [lista, aba])
  const emLote = admin && (aba === 'novo' || aba === 'mudou')
  const idsMarcados = daAba.filter((n) => marcadas.has(n.id)).map((n) => n.id)

  function escolherAba(id: TipoNovidade) {
    setAba(id)
    setMarcadas(new Set())
  }

  function teclas(e: KeyboardEvent, i: number) {
    let j = i
    if (e.key === 'ArrowRight') j = (i + 1) % ABAS.length
    else if (e.key === 'ArrowLeft') j = (i - 1 + ABAS.length) % ABAS.length
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = ABAS.length - 1
    else return
    e.preventDefault()
    escolherAba(ABAS[j].id)
    botoes.current[ABAS[j].id]?.focus()
  }

  function tirar(ids: number[]) {
    const fora = new Set(ids)
    setLista((l) => l.filter((n) => !fora.has(n.id)))
    setMarcadas((m) => new Set([...m].filter((id) => !fora.has(id))))
    // O cartão sumiu com o foco dentro: o foco vai para o painel da aba, sem cair no topo da página.
    painel.current?.focus()
  }

  /** Lê de novo as abertas da regional. Se falhar, fica a lista atual (o aviso do erro já está na tela). */
  async function recarregar() {
    try {
      const novidades = await listarNovidades(c, regional)
      const novaInfo = await infoDosProjetos(c, novidades.filter((n) => n.tipo !== 'novo').map((n) => n.projeto))
      setLista(novidades)
      setInfo(novaInfo)
    } catch {
      // sem recarga: a lista atual continua
    }
  }

  /** Uma gravação por vez. O cartão só sai da lista quando o banco confirma. */
  async function gravar(id: number | 'lote', rotulo: string, ids: number[], acao: () => Promise<unknown>, pronto: string) {
    if (ocupado.current) return
    ocupado.current = true
    setSalvando({ id, rotulo })
    setAviso(null)
    setFeito('')
    try {
      await acao()
      tirar(ids)
      setFeito(pronto)
    } catch (e) {
      const msg = mensagemDeErro(e)
      // Alguém decidiu antes (ou a resposta anterior se perdeu): a novidade não está mais aberta.
      if (msg === JA_DECIDIDA && id !== 'lote') tirar(ids)
      setAviso(msg)
      // Lote recusado (uma marcada foi trocada pelo importador, por exemplo): a lista vem de novo
      // do banco e a seleção é limpa, para a próxima tentativa não repetir o mesmo erro.
      if (id === 'lote') {
        setMarcadas(new Set())
        await recarregar()
      }
    } finally {
      ocupado.current = false
      setSalvando(null)
    }
  }

  function decidir(n: Novidade, d: Decisao) {
    const acao = d.acao === 'recusar'
      ? () => recusarNovidade(c, n.id)
      : () => aceitarNovidade(c, n.id, d.escolha)
    const pronto = d.acao === 'recusar' ? `Recusada: ${n.projeto}.` : `${d.rotulo}: ${n.projeto}.`
    void gravar(n.id, d.rotulo, [n.id], acao, pronto)
  }

  function aceitarMarcadas() {
    const ids = idsMarcados
    if (ids.length === 0) return
    void gravar('lote', 'lote', ids, () => aceitarEmLote(c, ids), `${ids.length} ${ids.length === 1 ? 'novidade aceita' : 'novidades aceitas'}.`)
  }

  const todasMarcadas = daAba.length > 0 && idsMarcados.length === daAba.length
  const textoLote = salvando?.id === 'lote' ? 'Salvando...' : `Aceitar selecionadas (${idsMarcados.length})`

  return (
    <section className="nov" aria-label="Novidades da Enel">
      <FaixaImportacoes regional={regional} importacoes={carga.importacoes} agora={agora} />

      {!admin && <p className="nov__nota"><Info size={16} weight="bold" aria-hidden="true" />Só um administrador aceita ou recusa as novidades.</p>}

      {aviso && (
        <div className="cart__aviso" role="alert">
          <WarningCircle size={18} weight="bold" aria-hidden="true" />
          <span>{aviso}</span>
          <button type="button" className="cart__aviso-x" aria-label="Fechar aviso" onClick={() => setAviso(null)}>
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>
      )}
      <p className="cfg__oculto" role="status">{feito}</p>

      {lista.length === 0 ? (
        <p className="cfg__vazio nov__vazio">Nenhuma novidade da Enel para decidir.</p>
      ) : (
        <>
          <div className="cfg__abas nov__abas" role="tablist" aria-label="Tipos de novidade">
            {ABAS.map((a, i) => (
              <button
                key={a.id}
                ref={(el) => { botoes.current[a.id] = el }}
                type="button"
                role="tab"
                id={`nov-aba-${a.id}`}
                aria-selected={aba === a.id}
                aria-controls="nov-painel"
                tabIndex={aba === a.id ? 0 : -1}
                className="cfg__aba"
                onClick={() => escolherAba(a.id)}
                onKeyDown={(e) => teclas(e, i)}
              >
                {a.nome} <span className="nov__aba-n">{contagem[a.id]}</span>
              </button>
            ))}
          </div>

          <div
            ref={painel}
            role="tabpanel"
            id="nov-painel"
            aria-labelledby={`nov-aba-${aba}`}
            tabIndex={-1}
            className="nov__painel"
          >
            {emLote && daAba.length > 0 && (
              <div className="nov__lote">
                <label className="cart__marca">
                  <input
                    type="checkbox"
                    checked={todasMarcadas}
                    onChange={(e) => setMarcadas(e.target.checked ? new Set(daAba.map((n) => n.id)) : new Set())}
                  />
                  Selecionar todas
                </label>
                <button
                  type="button"
                  className="cfg__botao cfg__botao--p cfg__botao--forte"
                  aria-disabled={idsMarcados.length === 0 || salvando !== null ? 'true' : undefined}
                  onClick={() => { if (salvando === null) aceitarMarcadas() }}
                >
                  {textoLote}
                </button>
              </div>
            )}
            {daAba.length === 0 ? (
              <p className="cfg__vazio">Nada nesta aba.</p>
            ) : (
              <ul className="nov__lista">
                {daAba.map((n) => (
                  <CartaoNovidade
                    key={n.id}
                    novidade={n}
                    info={info.get(n.projeto)}
                    admin={admin}
                    selecionavel={emLote}
                    selecionada={marcadas.has(n.id)}
                    aoSelecionar={(m) => setMarcadas((s) => {
                      const novo = new Set(s)
                      if (m) novo.add(n.id)
                      else novo.delete(n.id)
                      return novo
                    })}
                    salvando={salvando?.id === n.id ? salvando.rotulo : null}
                    ocupado={salvando !== null}
                    aoDecidir={(d) => decidir(n, d)}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}
