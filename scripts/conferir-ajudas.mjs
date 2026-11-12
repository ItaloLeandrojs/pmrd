// Funções puras do conferir-supabase.mjs (sem rede e sem arquivos), para o Vitest testar.

/** Lê um texto no formato CHAVE=valor (uma por linha) e devolve { CHAVE: valor }. */
export function lerEnv(texto) {
  const valores = {}
  for (const linha of texto.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linha)
    if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return valores
}

/** Nomes (da lista) que não têm valor em `valores`. */
export function nomesQueFaltam(valores, nomes) {
  return nomes.filter((nome) => !valores[nome])
}

/**
 * Acesso negado pelo banco: só conta o erro 42501 (permissão negada, que o RLS e o revoke de
 * 001_base.sql devolvem) ou nenhuma linha lida/mexida. Qualquer outro erro (rede, chave errada,
 * projeto pausado, tabela inexistente) NÃO prova a regra: o item deve sair FALHOU.
 */
export function negado({ error, data }) {
  if (error) return error.code === '42501'
  return Array.isArray(data) && data.length === 0
}

/**
 * A função de decidir novidades recusou quem não é administrador: só conta o erro P0001 com a
 * frase do 002_novidades.sql. Função inexistente (002 não rodado), rede ou outra recusa NÃO
 * provam a regra: o item deve sair FALHOU.
 */
export function soAdministrador(error) {
  return error?.code === 'P0001' && /^Só administrador/.test(error.message ?? '')
}

/** Uma etapa válida e diferente da atual, para o teste de troca. */
export function etapaDeTroca(atual) {
  return atual === 'SOLICITAR VISTORIA' ? 'EM ANÁLISE' : 'SOLICITAR VISTORIA'
}

/** Status HTTP de um erro do supabase-js (functions.invoke guarda a Response em context). */
export function statusDoErro(error) {
  const status = error?.context?.status
  return typeof status === 'number' ? status : null
}

/** Texto de ajuda quando falta o arquivo da conta de teste (sem nenhum valor real). */
export function ajudaContaDeTeste(caminho) {
  return [
    `Falta o arquivo da conta de teste: ${caminho}`,
    'Ele fica fora do repositório (uma pasta acima do projeto). Para criar:',
    '  1. No site do PMRD, entre como administrador, abra Configurações e crie uma conta com papel "equipe" (uma conta só para teste).',
    '  2. Crie o arquivo pmrd-teste.env nesse caminho com duas linhas:',
    '       EMAIL_TESTE=<e-mail da conta de teste>',
    '       SENHA_TESTE=<senha atual da conta de teste>',
    '  3. Entre uma vez no site com essa conta e troque a senha provisória (o script não troca senha).',
  ].join('\n')
}
