// Usuários: criar conta, senha provisória, papel e acesso. Tudo passa pela função `usuarios`.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import type { Papel } from '../../dominio/tipos'
import { listarUsuarios, type Usuario } from '../../nuvem/configuracoes'
import { mensagemDeErro } from '../../nuvem/erros'
import { chamarUsuarios, type PedidoUsuarios } from '../../nuvem/usuarios'

const ROTULO_PAPEL: Record<Papel, string> = {
  admin: 'Administrador',
  equipe: 'Equipe',
  importador: 'Importador (robô)',
}

export function Usuarios({ c, meuId }: { c: SupabaseClient; meuId: string }) {
  const [lista, setLista] = useState<Usuario[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [redefinindo, setRedefinindo] = useState<string | null>(null)
  const [senhaNova, setSenhaNova] = useState('')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<'admin' | 'equipe'>('equipe')
  const [senha, setSenha] = useState('')

  const carregar = useCallback(async () => {
    try {
      setLista(await listarUsuarios(c))
    } catch (e) {
      setErro(mensagemDeErro(e))
      setLista((atual) => atual ?? [])
    }
  }, [c])

  useEffect(() => { void carregar() }, [carregar])

  // Devolve true se deu certo; depois de uma ação certa a lista é recarregada.
  async function pedir(p: PedidoUsuarios, feito: string): Promise<boolean> {
    setErro(null)
    setAviso(null)
    const r = await chamarUsuarios(c, p)
    if (!r.ok) {
      setErro(r.erro)
      return false
    }
    setAviso(feito)
    await carregar()
    return true
  }

  async function criar(e: FormEvent) {
    e.preventDefault()
    const ok = await pedir({ acao: 'criar', nome, email, papel, senha }, 'Conta criada. Passe a senha provisória à pessoa.')
    if (ok) { setNome(''); setEmail(''); setSenha(''); setPapel('equipe') }
  }

  async function redefinir(e: FormEvent, id: string) {
    e.preventDefault()
    const ok = await pedir({ acao: 'redefinir', id, senha: senhaNova }, 'Senha provisória definida. A pessoa troca no próximo acesso.')
    if (ok) { setRedefinindo(null); setSenhaNova('') }
  }

  return (
    <div className="cfg__dupla">
      <form className="cfg__form" onSubmit={criar} noValidate>
        <h2 className="cfg__sub">Nova conta</h2>
        <label className="cfg__rotulo" htmlFor="us-nome">Nome</label>
        <input id="us-nome" className="cfg__entrada" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
        <label className="cfg__rotulo" htmlFor="us-email">E-mail</label>
        <input id="us-email" type="email" className="cfg__entrada" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        <label className="cfg__rotulo" htmlFor="us-papel">Papel</label>
        <select id="us-papel" className="cfg__entrada" value={papel} onChange={(e) => setPapel(e.target.value as 'admin' | 'equipe')}>
          <option value="equipe">Equipe</option>
          <option value="admin">Administrador</option>
        </select>
        <label className="cfg__rotulo" htmlFor="us-senha">Senha provisória da conta</label>
        <input id="us-senha" type="text" className="cfg__entrada cfg__mono" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="off" />
        <p className="cfg__dica">Mínimo de 8 caracteres. A pessoa troca no primeiro acesso.</p>
        <div className="cfg__acoes">
          <button type="submit" className="cfg__botao cfg__botao--forte">Criar conta</button>
        </div>
      </form>

      <div className="cfg__coluna">
        {erro && (
          <p className="cfg__erro" role="alert">
            <WarningCircle size={18} weight="bold" aria-hidden="true" />
            {erro}
          </p>
        )}
        {aviso && (
          <p className="cfg__ok" role="status">
            <CheckCircle size={18} weight="bold" aria-hidden="true" />
            {aviso}
          </p>
        )}
        {lista === null ? <p className="cfg__vazio" role="status">Carregando...</p>
          : lista.length === 0 ? <p className="cfg__vazio">Nenhuma conta encontrada.</p>
          : (
            <ul className="cfg__itens">
              {lista.map((u) => {
                const sou = u.id === meuId
                return (
                  <li key={u.id} className={`cfg__usuario${u.ativo ? '' : ' cfg__off'}`}>
                    <div className="cfg__usuario-topo">
                      <span className="cfg__item-nome">
                        {u.nome.trim() || u.email}
                        {u.nome.trim() !== '' && <span className="cfg__item-sub">{u.email}</span>}
                      </span>
                      <span className="cfg__item-sit">
                        {ROTULO_PAPEL[u.papel]}
                        {!u.ativo && ', desativado'}
                        {u.senha_provisoria && ', senha provisória'}
                      </span>
                    </div>
                    {u.papel !== 'importador' && (
                    <div className="cfg__acoes">
                      <button type="button" className="cfg__botao cfg__botao--p"
                        aria-expanded={redefinindo === u.id} aria-controls={`us-redefinir-${u.id}`}
                        onClick={() => { setRedefinindo(redefinindo === u.id ? null : u.id); setSenhaNova('') }}>
                        Redefinir senha
                      </button>
                      {u.papel === 'equipe' && (
                        <button type="button" className="cfg__botao cfg__botao--p" onClick={() => void pedir({ acao: 'papel', id: u.id, papel: 'admin' }, 'Papel mudado para administrador.')}>
                          Tornar admin
                        </button>
                      )}
                      {u.papel === 'admin' && !sou && (
                        <button type="button" className="cfg__botao cfg__botao--p" onClick={() => void pedir({ acao: 'papel', id: u.id, papel: 'equipe' }, 'Papel mudado para equipe.')}>
                          Tornar equipe
                        </button>
                      )}
                      {!sou && (u.ativo
                        ? <button type="button" className="cfg__botao cfg__botao--p" onClick={() => void pedir({ acao: 'desativar', id: u.id }, 'Conta desativada.')}>Desativar</button>
                        : <button type="button" className="cfg__botao cfg__botao--p" onClick={() => void pedir({ acao: 'reativar', id: u.id }, 'Conta reativada.')}>Reativar</button>)}
                    </div>
                    )}
                    {redefinindo === u.id && (
                      <form id={`us-redefinir-${u.id}`} className="cfg__redefinir" onSubmit={(e) => void redefinir(e, u.id)} noValidate>
                        <label className="cfg__rotulo" htmlFor={`us-nova-${u.id}`}>Senha provisória</label>
                        <div className="cfg__inline-linha">
                          <input id={`us-nova-${u.id}`} className="cfg__entrada cfg__mono" value={senhaNova}
                            onChange={(e) => setSenhaNova(e.target.value)} autoComplete="off" autoFocus />
                          <button type="submit" className="cfg__botao cfg__botao--forte">Salvar senha</button>
                        </div>
                      </form>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
      </div>
    </div>
  )
}
