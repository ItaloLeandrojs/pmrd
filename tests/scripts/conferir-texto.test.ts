import { describe, expect, it } from 'vitest'
// @ts-expect-error script .mjs sem tipos
import { conferirFonte, conferirHtml, emailsProibidos } from '../../scripts/conferir-texto.mjs'

const pagina = (corpo: string, lang = 'pt-BR') =>
  `<!doctype html><html lang="${lang}"><head><title>PMRD</title></head><body>${corpo}</body></html>`

describe('conferir-texto', () => {
  it('aceita e-mail de exemplo e recusa os outros', () => {
    expect(emailsProibidos('a@exemplo.test b@Exemplo.com')).toEqual([])
    const fora = ['pessoa', 'empresa.com.br'].join('@') // montado aqui para o conferir não acusar o próprio teste
    expect(emailsProibidos(fora)).toEqual([fora])
    expect(emailsProibidos('import "@supabase/supabase-js@2.118.0"')).toEqual([])
  })

  it('acha travessão, "rua", img sem alt e lang errado no HTML', () => {
    const ruim = conferirHtml(pagina('<h1>Ok</h1><p>um — dois</p><p>Na rua 3</p><img src="a.png">', 'en'))
    expect(ruim.length).toBe(4)
    expect(conferirHtml(pagina('<h1>Ok</h1><p>Campo 3, trua</p><img src="a.png" alt="">'))).toHaveLength(1)
  })

  it('no código-fonte, travessão e "rua" só contam em texto de tela', () => {
    expect(conferirFonte('x.tsx', '<p>rua nova</p>', { tela: true })).toHaveLength(1)
    expect(conferirFonte('x.ts', '// rua — ok em comentário de código', { tela: false })).toEqual([])
  })
})
