// Tela de login: foto de um lado, marca e formulário do outro (rascunho telas-v2).
import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeSlash, EnvelopeSimple, LockSimple, WarningCircle } from '@phosphor-icons/react'
import { Logo } from '../../marca/Logo'

interface Props {
  entrar: (email: string, senha: string) => Promise<string | null>
}

export const FOTO_LOGIN = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/fotos/login.jpg`

export function Entrada({ entrar }: Props) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    if (!email.trim() || !senha) {
      setErro('Digite o e-mail e a senha.')
      return
    }
    setErro(null)
    setEnviando(true)
    const msg = await entrar(email, senha)
    setEnviando(false)
    if (msg) setErro(msg)
  }

  return (
    <main className="entrada">
      <div className="entrada__foto">
        <img src={FOTO_LOGIN} alt="" />
        <p className="entrada__legenda">
          <b>Planejamento de Manutenção da Rede</b>
          <br />
          Centro-Sul, Sul e Leste. Acesso da equipe do PCM.
        </p>
      </div>
      <div className="entrada__lado">
        <Logo tamanho={72} />
        <h1 className="entrada__desc">Planejamento de Manutenção da Rede de Distribuição</h1>
        <form onSubmit={enviar} noValidate>
          <label className="campo" htmlFor="entrada-email">E-mail</label>
          <div className="campo__caixa">
            <EnvelopeSimple size={18} aria-hidden="true" />
            <input id="entrada-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <label className="campo" htmlFor="entrada-senha">Senha</label>
          <div className="campo__caixa">
            <LockSimple size={18} aria-hidden="true" />
            <input id="entrada-senha" type={ver ? 'text' : 'password'} autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
            <button type="button" className="campo__olho" aria-label={ver ? 'Esconder senha' : 'Mostrar senha'} onClick={() => setVer((v) => !v)}>
              {ver ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {erro && (
            <p className="entrada__erro" role="alert">
              <WarningCircle size={18} weight="bold" aria-hidden="true" />
              {erro}
            </p>
          )}
          <button type="submit" className="botao-principal" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
            {!enviando && <ArrowRight size={18} weight="bold" aria-hidden="true" />}
          </button>
        </form>
        <p className="entrada__aviso">Esqueceu a senha? Peça ao administrador</p>
        <div className="entrada__rodape">PCM</div>
      </div>
    </main>
  )
}
