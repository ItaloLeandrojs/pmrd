// Motivos de não execução: só se acrescenta ou desativa (o histórico do Report usa o nome).
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { WarningCircle } from '@phosphor-icons/react'
import { listarMotivos, novoMotivo, salvarMotivo, type Motivo } from '../../nuvem/configuracoes'
import { mensagemDeErro } from '../../nuvem/erros'

export function Motivos({ c }: { c: SupabaseClient }) {
  const [lista, setLista] = useState<Motivo[] | null>(null)
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setLista(await listarMotivos(c))
    } catch (e) {
      setErro(mensagemDeErro(e))
      setLista((atual) => atual ?? [])
    }
  }, [c])

  useEffect(() => { void carregar() }, [carregar])

  async function acrescentar(e: FormEvent) {
    e.preventDefault()
    const n = nome.trim().toUpperCase()
    if (!n) return setErro('Escreva o nome do motivo.')
    if (lista?.some((m) => m.nome.toUpperCase() === n)) return setErro('Esse motivo já existe.')
    setErro(null)
    try {
      await novoMotivo(c, n, Math.max(0, ...(lista ?? []).map((m) => m.ordem)) + 1)
      setNome('')
      await carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  async function alternar(m: Motivo) {
    setErro(null)
    try {
      await salvarMotivo(c, { ...m, ativo: !m.ativo })
      await carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  return (
    <div className="cfg__coluna">
      <form className="cfg__inline" onSubmit={acrescentar} noValidate>
        <label className="cfg__rotulo" htmlFor="mot-nome">Novo motivo</label>
        <div className="cfg__inline-linha">
          <input id="mot-nome" className="cfg__entrada" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
          <button type="submit" className="cfg__botao cfg__botao--forte">Acrescentar</button>
        </div>
      </form>
      {erro && (
        <p className="cfg__erro" role="alert">
          <WarningCircle size={18} weight="bold" aria-hidden="true" />
          {erro}
        </p>
      )}
      {lista === null ? <p className="cfg__vazio" role="status">Carregando...</p>
        : lista.length === 0 ? <p className="cfg__vazio">Nenhum motivo cadastrado.</p>
        : (
          <ul className="cfg__itens">
            {lista.map((m) => (
              <li key={m.id} className={m.ativo ? '' : 'cfg__off'}>
                <span className="cfg__item-nome">{m.nome}</span>
                <span className="cfg__item-sit">{m.ativo ? 'Ativo' : 'Inativo'}</span>
                <button type="button" className="cfg__botao cfg__botao--p" onClick={() => void alternar(m)} aria-label={`${m.ativo ? 'Desativar' : 'Reativar'} ${m.nome}`}>
                  {m.ativo ? 'Desativar' : 'Reativar'}
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
