// Quadro para cadastrar à mão um projeto que não veio pela importação da Enel.
import { useState } from 'react'
import { PRIORIDADES } from '../../dominio/prioridades'
import type { FiltroRegional, Regional } from '../../dominio/tipos'
import { criarProjetoManual } from '../../nuvem/carteira'
import { nuvem } from '../../nuvem/cliente'
import { mensagemDeErro } from '../../nuvem/erros'
import { Quadro } from './Quadro'
import { validarNovoProjeto, type NovoProjeto as Novo } from './novoProjeto'

interface Props {
  /** Regional escolhida no alto do site; "Todas" obriga a escolher uma aqui. */
  regional: FiltroRegional
  /** Projetos já carregados, normalizados (maiúsculas, sem espaços). */
  existentes: Set<string>
  /** `recarregar` é true quando algo foi gravado e a carteira precisa ser lida de novo. */
  aoFechar: (recarregar: boolean) => void
}

const REGIONAIS: { id: Regional; nome: string }[] = [
  { id: 'CS', nome: 'CS' },
  { id: 'SUL', nome: 'Sul' },
  { id: 'LESTE', nome: 'Leste' },
]

export function QuadroNovoProjeto({ regional, existentes, aoFechar }: Props) {
  const [projeto, setProjeto] = useState('')
  const [reg, setReg] = useState<string>(regional === 'TODAS' ? '' : regional)
  const [municipio, setMunicipio] = useState('')
  const [prioridade, setPrioridade] = useState('')
  const [ot, setOt] = useState('')
  const [endereco, setEndereco] = useState('')
  const [intervencao, setIntervencao] = useState('')
  const [ids, setIds] = useState('')
  const [qtd, setQtd] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [parcial, setParcial] = useState<string | null>(null)

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    if (reg === '') return setErro('Escolha a regional.')
    const lista = ids.split(/[\n,;]+/).map((x) => x.trim()).filter((x) => x !== '')
    const n: Novo = {
      projeto,
      regional: reg as Regional,
      municipio,
      prioridade: prioridade === '' ? null : Number(prioridade),
      ot_correcao: ot,
      endereco,
      intervencao_prevista: intervencao,
      ids_gom: lista,
      qtd_defeitos: qtd.trim() === '' ? undefined : Number(qtd),
    }
    const problema = validarNovoProjeto(n, existentes)
    if (problema) return setErro(problema)
    setErro(null)
    setEnviando(true)
    try {
      const r = await criarProjetoManual(nuvem!, n)
      if (r.ok) return aoFechar(true)
      if (r.projetoCriado) setParcial(r.erro)
      else setErro(r.erro)
    } catch (x) {
      setErro(`Não salvou: ${mensagemDeErro(x)}`)
    } finally {
      setEnviando(false)
    }
  }

  if (parcial !== null) {
    return (
      <Quadro titulo="Novo projeto" aoFechar={() => aoFechar(true)}>
        <div className="quadro__corpo">
          <p className="cfg__erro" role="alert">{parcial}</p>
          <p className="quadro__nota">O projeto entrou com a quantidade de defeitos informada, mas sem os ID GOM. Peça ao administrador para incluí-los ou espere o importador da Enel (plano 2).</p>
          <div className="quadro__acoes">
            <button type="button" className="cfg__botao cfg__botao--forte" onClick={() => aoFechar(true)}>Fechar e atualizar a carteira</button>
          </div>
        </div>
      </Quadro>
    )
  }

  return (
    <Quadro titulo="Novo projeto" aoFechar={() => aoFechar(false)}>
      <form className="quadro__corpo quadro__corpo--grade" onSubmit={criar} noValidate>
        <label className="quadro__campo">
          <span>Projeto</span>
          <input className="quadro__mono" type="text" value={projeto} onChange={(e) => setProjeto(e.target.value)} autoComplete="off" />
        </label>
        <label className="quadro__campo">
          <span>Regional</span>
          <select value={reg} onChange={(e) => setReg(e.target.value)}>
            {regional === 'TODAS' && <option value="">Escolha</option>}
            {REGIONAIS.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </label>
        <label className="quadro__campo">
          <span>Município</span>
          <input type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)} autoComplete="off" />
        </label>
        <label className="quadro__campo">
          <span>Prioridade</span>
          <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
            <option value="">Sem prioridade</option>
            {Object.entries(PRIORIDADES).map(([n, nome]) => <option key={n} value={n}>{`${n} ${nome}`}</option>)}
          </select>
        </label>
        <label className="quadro__campo">
          <span>OT de correção</span>
          <input className="quadro__mono" type="text" value={ot} onChange={(e) => setOt(e.target.value)} autoComplete="off" />
        </label>
        <label className="quadro__campo">
          <span>Intervenção prevista</span>
          <input type="text" value={intervencao} onChange={(e) => setIntervencao(e.target.value)} autoComplete="off" />
        </label>
        <label className="quadro__campo quadro__campo--larga">
          <span>Endereço</span>
          <input type="text" value={endereco} onChange={(e) => setEndereco(e.target.value)} autoComplete="off" />
        </label>
        <label className="quadro__campo">
          <span>ID GOM (um por linha)</span>
          <textarea className="quadro__mono" rows={4} value={ids} onChange={(e) => setIds(e.target.value)} />
        </label>
        <div className="quadro__campo">
          <label htmlFor="novo-qtd">Quantidade de defeitos</label>
          <input id="novo-qtd" type="number" min={1} inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-describedby="novo-qtd-dica" />
          <small id="novo-qtd-dica">Só quando o projeto não tem ID GOM (religador, TSSU).</small>
        </div>
        {erro && <p className="cfg__erro quadro__campo--larga" role="alert">{erro}</p>}
        <div className="quadro__acoes quadro__campo--larga">
          <button type="button" className="cfg__botao" onClick={() => aoFechar(false)}>Cancelar</button>
          <button type="submit" className="cfg__botao cfg__botao--forte" disabled={enviando}>Criar projeto</button>
        </div>
      </form>
    </Quadro>
  )
}
