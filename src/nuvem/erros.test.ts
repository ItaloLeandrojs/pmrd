import { describe, expect, it } from 'vitest'
import { CONTA_DESATIVADA, NadaGravado, mensagemDeErro } from './erros'

describe('mensagemDeErro', () => {
  it('traduz credenciais inválidas', () => {
    expect(mensagemDeErro({ message: 'Invalid login credentials' })).toBe('E-mail ou senha não conferem.')
  })
  it('traduz falha de rede', () => {
    expect(mensagemDeErro(new TypeError('Failed to fetch'))).toBe(
      'Sem conexão com o servidor. Confira a internet ou a VPN.',
    )
  })
  it('traduz conta desativada (banned) pelo código e pela frase', () => {
    expect(mensagemDeErro({ code: 'user_banned', message: 'x' })).toBe(CONTA_DESATIVADA)
    expect(mensagemDeErro({ message: 'User is banned' })).toBe(CONTA_DESATIVADA)
  })
  it('avisa quando o banco não gravou nenhuma linha', () => {
    expect(mensagemDeErro(new NadaGravado())).toMatch(/^Não foi gravado\./)
  })
  it('mostra como veio a frase das funções do banco (raise exception, código P0001)', () => {
    expect(mensagemDeErro({ code: 'P0001', message: 'Esta novidade já foi decidida.' })).toBe('Esta novidade já foi decidida.')
    expect(mensagemDeErro({ code: 'P0001', message: '' })).toBe('Algo deu errado. Tente de novo.')
  })
  it('usa frase genérica para o desconhecido', () => {
    expect(mensagemDeErro(new Error('xyz'))).toBe('Algo deu errado. Tente de novo.')
    expect(mensagemDeErro(null)).toBe('Algo deu errado. Tente de novo.')
    expect(mensagemDeErro('texto solto')).toBe('Algo deu errado. Tente de novo.')
  })
})
