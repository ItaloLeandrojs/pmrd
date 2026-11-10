import { describe, expect, it } from 'vitest'
import { mensagemDeErro } from './erros'

describe('mensagemDeErro', () => {
  it('traduz credenciais inválidas', () => {
    expect(mensagemDeErro({ message: 'Invalid login credentials' })).toBe('E-mail ou senha não conferem.')
  })
  it('traduz falha de rede', () => {
    expect(mensagemDeErro(new TypeError('Failed to fetch'))).toBe(
      'Sem conexão com o servidor. Confira a internet ou a VPN.',
    )
  })
  it('usa frase genérica para o desconhecido', () => {
    expect(mensagemDeErro(new Error('xyz'))).toBe('Algo deu errado. Tente de novo.')
    expect(mensagemDeErro(null)).toBe('Algo deu errado. Tente de novo.')
    expect(mensagemDeErro('texto solto')).toBe('Algo deu errado. Tente de novo.')
  })
})
