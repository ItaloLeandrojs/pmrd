// Conta do robô importador: não usa o site, só pode sair.
import { Logo } from '../marca/Logo'
import { FOTO_LOGIN } from '../telas/entrada/Entrada'

export function SemAcesso({ sair }: { sair: () => void | Promise<void> }) {
  return (
    <main className="entrada">
      <div className="entrada__foto">
        <img src={FOTO_LOGIN} alt="" />
      </div>
      <div className="entrada__lado">
        <Logo tamanho={48} />
        <h1 className="entrada__titulo">Esta conta não usa o site.</h1>
        <p className="entrada__texto">Ela existe só para o envio automático da demanda. Use a sua conta pessoal para entrar.</p>
        <button type="button" className="botao-texto" onClick={() => void sair()}>Sair</button>
      </div>
    </main>
  )
}
