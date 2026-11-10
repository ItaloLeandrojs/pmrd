// Primeiro acesso: a senha provisória precisa ser trocada antes de entrar no site.
import { useState, type FormEvent } from 'react'
import { ArrowRight, LockSimple, WarningCircle } from '@phosphor-icons/react'
import { Logo } from '../../marca/Logo'
import { FOTO_LOGIN } from './Entrada'

interface Props {
  trocarSenha: (nova: string) => Promise<string | null>
  sair: () => void | Promise<void>
}

export function NovaSenha({ trocarSenha, sair }: Props) {
  const [nova, setNova] = useState('')
  const [repetir, setRepetir] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    if (nova.length < 8) {
      setErro('A senha precisa de pelo menos 8 caracteres.')
      return
    }
    if (nova !== repetir) {
      setErro('As duas senhas não são iguais.')
      return
    }
    setErro(null)
    setEnviando(true)
    const msg = await trocarSenha(nova)
    setEnviando(false)
    if (msg) setErro(msg)
  }

  return (
    <main className="entrada">
      <div className="entrada__foto">
        <img src={FOTO_LOGIN} alt="" />
      </div>
      <div className="entrada__lado">
        <Logo tamanho={48} />
        <h1 className="entrada__titulo">Crie a sua senha</h1>
        <p className="entrada__texto">A senha que você recebeu vale só para o primeiro acesso. Escolha uma nova, com pelo menos 8 caracteres.</p>
        <form onSubmit={enviar} noValidate>
          <label className="campo" htmlFor="nova-senha">Nova senha</label>
          <div className="campo__caixa">
            <LockSimple size={18} aria-hidden="true" />
            <input id="nova-senha" type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
          </div>
          <label className="campo" htmlFor="repetir-senha">Repita a nova senha</label>
          <div className="campo__caixa">
            <LockSimple size={18} aria-hidden="true" />
            <input id="repetir-senha" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
          </div>
          {erro && (
            <p className="entrada__erro" role="alert">
              <WarningCircle size={18} weight="bold" aria-hidden="true" />
              {erro}
            </p>
          )}
          <button type="submit" className="botao-principal" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar e entrar'}
            {!enviando && <ArrowRight size={18} weight="bold" aria-hidden="true" />}
          </button>
        </form>
        <button type="button" className="botao-texto" onClick={() => void sair()}>Sair</button>
      </div>
    </main>
  )
}
