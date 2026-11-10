// Marcador das telas que ainda não existem.
import { Hammer } from '@phosphor-icons/react'

export function EmConstrucao({ nome, plano }: { nome: string; plano?: number }) {
  return (
    <section className="construcao" aria-label={nome}>
      <Hammer size={28} weight="duotone" aria-hidden="true" />
      <h2>{nome}</h2>
      <p>{plano ? `Esta tela chega no plano ${plano}.` : 'Esta tela chega em breve.'}</p>
    </section>
  )
}
