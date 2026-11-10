// Tela Carteira: carrega os projetos da regional, filtra por atalho e busca, e grava mudanças na linha.
import { useEffect, useMemo, useRef, useState } from 'react'
import { MagnifyingGlass, Plus, WarningCircle, X } from '@phosphor-icons/react'
import { hojeEmFortaleza } from '../../dominio/datas'
import type { DataISO, FiltroRegional } from '../../dominio/tipos'
import { nuvem } from '../../nuvem/cliente'
import { atualizarProjeto, listarProjetos, type ProjetoLinha } from '../../nuvem/carteira'
import { carregarParametros, type Parametros } from '../../nuvem/configuracoes'
import { mensagemDeErro } from '../../nuvem/erros'
import { useListaOtimista } from '../../nuvem/otimista'
import { listarPessoas } from '../../nuvem/perfil'
import { Atalhos } from './Atalhos'
import { contarAtalhos, filtrarCarteira, type Atalho } from './filtros'
import { Ficha, type AcaoPedido } from './Ficha'
import { QuadroNovoProjeto } from './QuadroNovoProjeto'
import { normalizarProjeto } from './novoProjeto'
import { PedidoGestor, type DadosPedido } from './PedidoGestor'
import { TabelaCarteira, type Pessoa } from './TabelaCarteira'

interface Props {
  regional: FiltroRegional
  /** Só para testes: fixa o "hoje". Em uso normal, é o dia de Fortaleza. */
  hoje?: DataISO
  /** Chamado também quando a ficha abre (Enter ou clique na linha). */
  aoAbrir?: (p: ProjetoLinha) => void
}

interface Carga { linhas: ProjetoLinha[]; pessoas: Pessoa[]; parametros: Parametros }

export function Carteira({ regional, hoje, aoAbrir }: Props) {
  const [carga, setCarga] = useState<Carga | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (!nuvem) return
    let vivo = true
    setCarga(null)
    setErro(null)
    Promise.all([listarProjetos(nuvem, regional), carregarParametros(nuvem), listarPessoas(nuvem)])
      .then(([linhas, parametros, pessoas]) => { if (vivo) setCarga({ linhas, parametros, pessoas }) })
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
  if (!carga) return <p className="cfg__vazio" role="status">Carregando a carteira...</p>
  return <CarteiraCarregada
      key={`${regional}-${tentativa}`}
      regional={regional}
      carga={carga}
      hoje={hoje}
      aoAbrir={aoAbrir}
      recarregar={() => setTentativa((t) => t + 1)}
    />
}

function CarteiraCarregada({ regional, carga, hoje: hojeFixo, aoAbrir, recarregar }: Props & { carga: Carga; recarregar: () => void }) {
  const c = nuvem!
  const hoje = useMemo(() => hojeFixo ?? hojeEmFortaleza(new Date()), [hojeFixo])
  const { linhas, aviso, gravar, fecharAviso, pendentes } = useListaOtimista(carga.linhas, 'projeto')
  const [atalho, setAtalho] = useState<Atalho>('todas')
  const [busca, setBusca] = useState('')
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false)
  const [fichaDe, setFichaDe] = useState<string | null>(null)
  const [pedindo, setPedindo] = useState<{ projeto: string; inicial: { em: DataISO | null; por: string | null } | null } | null>(null)
  const [novo, setNovo] = useState(false)
  const devolverFoco = useRef<string | null>(null)

  const contagem = useMemo(() => contarAtalhos(linhas, hoje), [linhas, hoje])
  const visiveis = useMemo(
    () => filtrarCarteira(linhas, { atalho, busca, mostrarConcluidas, hoje }),
    [linhas, atalho, busca, mostrarConcluidas, hoje],
  )

  const linhaDaFicha = fichaDe === null ? undefined : linhas.find((l) => l.projeto === fichaDe)
  const existentes = useMemo(() => new Set(linhas.map((l) => normalizarProjeto(l.projeto))), [linhas])

  function abrirFicha(p: ProjetoLinha) {
    setFichaDe(p.projeto)
    aoAbrir?.(p)
  }

  function fecharFicha() {
    devolverFoco.current = fichaDe
    setFichaDe(null)
  }

  // Ao fechar a ficha, o foco volta para a linha do projeto.
  useEffect(() => {
    if (fichaDe !== null || devolverFoco.current === null) return
    const projeto = devolverFoco.current
    devolverFoco.current = null
    document.querySelector<HTMLElement>(`[role=row][data-projeto="${CSS.escape(projeto)}"]`)?.focus()
  }, [fichaDe])

  // Esc fecha a ficha. Campos e seletores cuidam do próprio Esc; os quadros abertos também.
  useEffect(() => {
    if (fichaDe === null) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const alvo = e.target
      if (alvo instanceof HTMLElement && alvo.closest('input, select, textarea, [role=dialog]')) return
      fecharFicha()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  })

  function gravarPedido(projeto: string, d: DadosPedido | null) {
    const mudanca = d
      ? { pedido_gestor: true, pedido_gestor_em: d.em, pedido_gestor_por: d.por }
      : { pedido_gestor: false, pedido_gestor_em: null, pedido_gestor_por: null }
    // Uma gravação só, com a mesma proteção de conflito das outras mudanças da linha.
    void gravar(projeto, mudanca, (atual) => atualizarProjeto(c, projeto, atual.atualizado_em, mudanca))
  }

  function aoPedidoDaFicha(acao: AcaoPedido) {
    if (!linhaDaFicha) return
    if (acao === 'tirar') return gravarPedido(linhaDaFicha.projeto, null)
    setPedindo({
      projeto: linhaDaFicha.projeto,
      inicial: acao === 'editar' ? { em: linhaDaFicha.pedido_gestor_em, por: linhaDaFicha.pedido_gestor_por } : null,
    })
  }

  return (
    <section className="cart" aria-label="Carteira">
      <div className="cart__barra">
        <Atalhos ativo={atalho} contagem={contagem} aoEscolher={setAtalho} />
        <div className="cart__ferramentas">
          <label className="cart__busca">
            <MagnifyingGlass size={16} aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar na carteira"
              placeholder="Projeto, município ou alimentador"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
          <label className="cart__marca">
            <input type="checkbox" checked={mostrarConcluidas} onChange={(e) => setMostrarConcluidas(e.target.checked)} />
            Mostrar concluídas
          </label>
          <span className="cart__total" role="status">
            {visiveis.length} {visiveis.length === 1 ? 'projeto' : 'projetos'}
          </span>
          <button type="button" className="cfg__botao cfg__botao--p cfg__botao--forte" onClick={() => setNovo(true)}>
            <Plus size={15} weight="bold" aria-hidden="true" />
            Novo projeto
          </button>
        </div>
      </div>

      {aviso && (
        <div className="cart__aviso" role={/^Outra pessoa/.test(aviso) ? 'status' : 'alert'}>
          <WarningCircle size={18} weight="bold" aria-hidden="true" />
          <span>{aviso}</span>
          <button type="button" className="cart__aviso-x" aria-label="Fechar aviso" onClick={fecharAviso}>
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className={`cart__area${linhaDaFicha ? ' cart__area--ficha' : ''}`}>
        {visiveis.length === 0 ? (
          <p className="cfg__vazio cart__vazio">
            {linhas.length === 0
              ? 'Nenhum projeto nesta regional ainda. Eles chegam pela importação da Enel ou pelo botão Novo projeto.'
              : 'Nenhum projeto neste filtro. Troque o atalho ou limpe a busca.'}
          </p>
        ) : (
          <TabelaCarteira
            linhas={visiveis}
            pessoas={carga.pessoas}
            parametros={carga.parametros}
            hoje={hoje}
            salvando={pendentes}
            compacta={linhaDaFicha !== undefined}
            aoAbrir={abrirFicha}
            aoPedirGestor={(l) => setPedindo({ projeto: l.projeto, inicial: null })}
            aoMudar={(projeto, mudanca) => {
              void gravar(projeto, mudanca, (atual) => atualizarProjeto(c, projeto, atual.atualizado_em, mudanca))
            }}
          />
        )}
        {linhaDaFicha && (
          <Ficha
            linha={linhaDaFicha}
            pessoas={carga.pessoas}
            parametros={carga.parametros}
            hoje={hoje}
            aoFechar={fecharFicha}
            aoPedidoGestor={aoPedidoDaFicha}
          />
        )}
      </div>

      {pedindo && (
        <PedidoGestor
          projeto={pedindo.projeto}
          inicial={pedindo.inicial}
          hoje={hoje}
          aoCancelar={() => setPedindo(null)}
          aoConfirmar={(d) => { gravarPedido(pedindo.projeto, d); setPedindo(null) }}
        />
      )}
      {novo && (
        <QuadroNovoProjeto
          regional={regional}
          existentes={existentes}
          aoFechar={(r) => { setNovo(false); if (r) recarregar() }}
        />
      )}
    </section>
  )
}
