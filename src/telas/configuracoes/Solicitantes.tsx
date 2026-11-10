// Solicitantes de SGD: só se acrescenta ou desativa (o histórico usa o nome).
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { WarningCircle } from '@phosphor-icons/react'
import { listarSolicitantes, novoSolicitante, salvarSolicitante, type Solicitante } from '../../nuvem/configuracoes'
import { mensagemDeErro } from '../../nuvem/erros'

export function Solicitantes({ c }: { c: SupabaseClient }) {
  const [lista, setLista] = useState<Solicitante[] | null>(null)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  // Uma gravação por vez: o duplo clique não pode criar dois iguais.
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setLista(await listarSolicitantes(c))
    } catch (e) {
      setErro(mensagemDeErro(e))
      setLista((atual) => atual ?? [])
    }
  }, [c])

  useEffect(() => { void carregar() }, [carregar])

  async function acrescentar(e: FormEvent) {
    e.preventDefault()
    if (salvando) return
    if (!nome.trim()) return setErro('Escreva o nome do solicitante.')
    setErro(null)
    setSalvando(true)
    try {
      await novoSolicitante(c, nome.trim(), email.trim() || null)
      setNome('')
      setEmail('')
      await carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  async function alternar(s: Solicitante) {
    if (salvando) return
    setErro(null)
    setSalvando(true)
    try {
      await salvarSolicitante(c, { ...s, ativo: !s.ativo })
      await carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="cfg__coluna">
      <form className="cfg__inline" onSubmit={acrescentar} noValidate>
        <div className="cfg__linha2">
          <div>
            <label className="cfg__rotulo" htmlFor="sol-nome">Nome do solicitante</label>
            <input id="sol-nome" className="cfg__entrada" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label className="cfg__rotulo" htmlFor="sol-email">E-mail (opcional)</label>
            <input id="sol-email" type="email" className="cfg__entrada" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
        </div>
        <div className="cfg__acoes">
          <button type="submit" className="cfg__botao cfg__botao--forte" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Acrescentar'}
          </button>
        </div>
      </form>
      {erro && (
        <p className="cfg__erro" role="alert">
          <WarningCircle size={18} weight="bold" aria-hidden="true" />
          {erro}
        </p>
      )}
      {lista === null ? <p className="cfg__vazio" role="status">Carregando...</p>
        : lista.length === 0 ? <p className="cfg__vazio">Nenhum solicitante cadastrado ainda.</p>
        : (
          <ul className="cfg__itens">
            {lista.map((s) => (
              <li key={s.id} className={s.ativo ? '' : 'cfg__off'}>
                <span className="cfg__item-nome">{s.nome}{s.email && <span className="cfg__item-sub">{s.email}</span>}</span>
                <span className="cfg__item-sit">{s.ativo ? 'Ativo' : 'Inativo'}</span>
                <button type="button" className="cfg__botao cfg__botao--p" disabled={salvando} onClick={() => void alternar(s)} aria-label={`${s.ativo ? 'Desativar' : 'Reativar'} ${s.nome}`}>
                  {s.ativo ? 'Desativar' : 'Reativar'}
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
