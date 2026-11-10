// Cadastro de equipes: o LID dá a base e o grupo sugerido do Report; o admin pode trocar o grupo.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { WarningCircle } from '@phosphor-icons/react'
import { baseDoLid, grupoSugerido } from '../../dominio/equipes'
import type { Regional, TipoEquipe } from '../../dominio/tipos'
import { listarEquipes, salvarEquipe, type Equipe } from '../../nuvem/configuracoes'
import { mensagemDeErro } from '../../nuvem/erros'

const TIPOS: TipoEquipe[] = ['ML', 'LVR', 'MP', 'LV']
const REGIONAIS: { id: Regional; nome: string }[] = [
  { id: 'CS', nome: 'Centro-Sul' },
  { id: 'SUL', nome: 'Sul' },
  { id: 'LESTE', nome: 'Leste' },
]

interface Rascunho {
  lid: string
  chefe: string
  tipo: TipoEquipe
  regional: Regional
  grupo: string
  grupoMexido: boolean
  ativa: boolean
  novo: boolean
  foto_path: string | null
}

const VAZIO: Rascunho = {
  lid: '', chefe: '', tipo: 'ML', regional: 'CS', grupo: '', grupoMexido: false, ativa: true, novo: true, foto_path: null,
}

export function Equipes({ c }: { c: SupabaseClient }) {
  const [lista, setLista] = useState<Equipe[] | null>(null)
  const [r, setR] = useState<Rascunho>(VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setLista(await listarEquipes(c))
    } catch (e) {
      setErro(mensagemDeErro(e))
      setLista((atual) => atual ?? [])
    }
  }, [c])

  useEffect(() => { void carregar() }, [carregar])

  const lid = r.lid.trim().toUpperCase()
  const base = baseDoLid(lid)

  // O grupo sugerido acompanha LID e tipo, mas só enquanto o admin não escreveu nele.
  function mudar(parte: Partial<Rascunho>) {
    setR((antes) => {
      const prox = { ...antes, ...parte }
      if (!prox.grupoMexido) {
        prox.grupo = grupoSugerido(prox.tipo, baseDoLid(prox.lid.trim().toUpperCase())) ?? ''
      }
      return prox
    })
  }

  function editar(e: Equipe) {
    setErro(null)
    setR({
      lid: e.lid, chefe: e.chefe, tipo: e.tipo, regional: e.regional, grupo: e.grupo_report ?? '',
      grupoMexido: true, ativa: e.ativa, novo: false, foto_path: e.foto_path,
    })
  }

  async function gravar(e: FormEvent) {
    e.preventDefault()
    if (salvando) return
    if (!lid) return setErro('Falta o LID da equipe.')
    if (!r.chefe.trim()) return setErro('Falta o chefe de turma.')
    // Equipe nova não pode sobrescrever uma existente (o upsert apagaria foto e dados).
    if (r.novo && lista?.some((x) => x.lid.trim().toUpperCase() === lid)) return setErro('Esse LID já existe. Use Editar.')
    setErro(null)
    setSalvando(true)
    try {
      await salvarEquipe(c, {
        lid, chefe: r.chefe.trim(), tipo: r.tipo, regional: r.regional,
        grupo_report: r.grupo.trim() || null, base, ativa: r.ativa, foto_path: r.foto_path,
      })
      setR(VAZIO)
      await carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  async function alternar(eq: Equipe) {
    setErro(null)
    try {
      await salvarEquipe(c, { ...eq, ativa: !eq.ativa })
      await carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  return (
    <div className="cfg__dupla">
      <form className="cfg__form" onSubmit={gravar} noValidate>
        <h2 className="cfg__sub">{r.novo ? 'Nova equipe' : 'Editar equipe'}</h2>
        <label className="cfg__rotulo" htmlFor="eq-lid">LID</label>
        <input id="eq-lid" className="cfg__entrada cfg__mono" value={r.lid} readOnly={!r.novo}
          onChange={(e) => mudar({ lid: e.target.value })} autoComplete="off" />
        <label className="cfg__rotulo" htmlFor="eq-chefe">Chefe de turma</label>
        <input id="eq-chefe" className="cfg__entrada" value={r.chefe} onChange={(e) => mudar({ chefe: e.target.value })} autoComplete="off" />
        <div className="cfg__linha2">
          <div>
            <label className="cfg__rotulo" htmlFor="eq-tipo">Tipo</label>
            <select id="eq-tipo" className="cfg__entrada" value={r.tipo} onChange={(e) => mudar({ tipo: e.target.value as TipoEquipe })}>
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="cfg__rotulo" htmlFor="eq-regional">Regional</label>
            <select id="eq-regional" className="cfg__entrada" value={r.regional} onChange={(e) => mudar({ regional: e.target.value as Regional })}>
              {REGIONAIS.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>
          </div>
        </div>
        <label className="cfg__rotulo" htmlFor="eq-base">Base</label>
        <input id="eq-base" className="cfg__entrada cfg__mono" value={base ?? ''} readOnly placeholder="vem do LID" />
        <label className="cfg__rotulo" htmlFor="eq-grupo">Grupo do Report</label>
        <input id="eq-grupo" className="cfg__entrada" value={r.grupo}
          onChange={(e) => setR((a) => ({ ...a, grupo: e.target.value, grupoMexido: true }))} autoComplete="off" />
        <label className="cfg__marca">
          <input type="checkbox" checked={r.ativa} onChange={(e) => setR((a) => ({ ...a, ativa: e.target.checked }))} />
          Equipe ativa
        </label>
        {erro && (
          <p className="cfg__erro" role="alert">
            <WarningCircle size={18} weight="bold" aria-hidden="true" />
            {erro}
          </p>
        )}
        <div className="cfg__acoes">
          <button type="submit" className="cfg__botao cfg__botao--forte" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar equipe'}
          </button>
          {!r.novo && <button type="button" className="cfg__botao" onClick={() => { setR(VAZIO); setErro(null) }}>Cancelar</button>}
        </div>
      </form>

      <div className="cfg__lista-caixa">
        {lista === null ? <p className="cfg__vazio" role="status">Carregando...</p>
          : lista.length === 0 ? <p className="cfg__vazio">Nenhuma equipe cadastrada ainda.</p>
          : (
            <table className="cfg__tabela">
              <caption className="cfg__oculto">Equipes cadastradas</caption>
              <thead><tr><th scope="col">LID</th><th scope="col">Chefe</th><th scope="col">Tipo</th><th scope="col">Grupo</th><th scope="col">Situação</th><th scope="col"><span className="cfg__oculto">Ações</span></th></tr></thead>
              <tbody>
                {lista.map((eq) => (
                  <tr key={eq.lid} className={eq.ativa ? '' : 'cfg__off'}>
                    <td className="cfg__mono">{eq.lid}</td>
                    <td>{eq.chefe}</td>
                    <td>{eq.tipo}</td>
                    <td>{eq.grupo_report ?? ''}</td>
                    <td>{eq.ativa ? 'Ativa' : 'Inativa'}</td>
                    <td className="cfg__cel-acoes">
                      <button type="button" className="cfg__botao cfg__botao--p" onClick={() => editar(eq)} aria-label={`Editar ${eq.lid}`}>Editar</button>
                      <button type="button" className="cfg__botao cfg__botao--p" onClick={() => void alternar(eq)} aria-label={`${eq.ativa ? 'Desativar' : 'Reativar'} ${eq.lid}`}>
                        {eq.ativa ? 'Desativar' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  )
}
