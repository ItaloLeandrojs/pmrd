// `node scripts/conferir-supabase.mjs`: confere, no Supabase de verdade, que as regras de acesso
// fazem o que o site espera. Lê o .env.local (PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY) e o
// ../pmrd-teste.env (EMAIL_TESTE e SENHA_TESTE de uma conta de teste com papel "equipe", fora do Git).
// Só usa a chave pública. Nunca imprime a senha nem a chave.
//
// Confere 5 coisas:
//   1. quem não entrou lê 0 projetos;
//   2. a conta de teste lê os projetos, muda a etapa de EXEMPLO-0001 e volta;
//   3. inserir em motivos é negado (só administrador);
//   4. a função usuarios responde 403 (só administrador);
//   5. a conta de teste lê as novidades e não consegue aceitar uma (só administrador).
// Imprime OK ou FALHOU em cada item e sai com código 1 se algum falhar. A etapa de EXEMPLO-0001
// volta ao valor original mesmo se algo falhar no meio (o carimbo etapa_desde e o histórico,
// porém, registram a troca e a volta: é assim que o banco funciona).
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  ajudaContaDeTeste, etapaDeTroca, lerEnv, negado, nomesQueFaltam, soAdministrador, statusDoErro,
} from './conferir-ajudas.mjs'

const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARQUIVO_SITE = path.join(PROJ, '.env.local')
const ARQUIVO_TESTE = path.join(PROJ, '..', 'pmrd-teste.env')
const PROJETO = 'EXEMPLO-0001'

function lerArquivo(arquivo, ajuda) {
  if (!fs.existsSync(arquivo)) {
    console.error(ajuda)
    process.exit(1)
  }
  return lerEnv(fs.readFileSync(arquivo, 'utf8'))
}

const site = lerArquivo(ARQUIVO_SITE,
  `Falta o arquivo ${ARQUIVO_SITE}. Copie o .env.exemplo para .env.local e preencha (veja docs/supabase-passo-a-passo.md).`)
const teste = lerArquivo(ARQUIVO_TESTE, ajudaContaDeTeste(ARQUIVO_TESTE))
const faltam = [
  ...nomesQueFaltam(site, ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY']),
  ...nomesQueFaltam(teste, ['EMAIL_TESTE', 'SENHA_TESTE']),
]
if (faltam.length) {
  console.error(`Faltam valores: ${faltam.join(', ')}.`)
  process.exit(1)
}

const URL = site.PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const CHAVE = site.PUBLIC_SUPABASE_ANON_KEY

const novoCliente = () => createClient(URL, CHAVE, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

let falhas = 0
function item(ok, texto, detalhe = '') {
  if (!ok) falhas++
  console.log(`${ok ? 'OK     ' : 'FALHOU '} ${texto}${detalhe ? ` (${detalhe})` : ''}`)
}

try {
  // ------------------------------------------------------------ 1. sem login
  console.log('Sem login:')
  const anonimo = novoCliente()
  const p0 = await anonimo.from('projetos').select('projeto')
  item(negado(p0), 'anon lê 0 projetos',
    p0.error ? `${p0.error.code ?? 'sem código'}: ${p0.error.message}` : `${p0.data.length} linha(s)`)

  // ------------------------------------------------------------ 2 a 4. conta de teste
  console.log('\nCom a conta de teste:')
  const logado = novoCliente()
  const entrada = await logado.auth.signInWithPassword({
    email: teste.EMAIL_TESTE, password: teste.SENHA_TESTE,
  })
  item(!entrada.error, 'entra com e-mail e senha', entrada.error?.message)
  if (entrada.error) {
    console.log('\nSem login não dá para conferir o resto. Confira o pmrd-teste.env.')
    process.exit(1)
  }

  const lista = await logado.from('projetos').select('projeto')
  item(!lista.error && lista.data.length > 0, 'lê os projetos',
    lista.error?.message ?? `${lista.data?.length} linha(s)`)

  // Troca a etapa de EXEMPLO-0001 e volta. O finally garante a volta mesmo com falha no meio.
  const antes = await logado.from('projetos').select('etapa').eq('projeto', PROJETO).maybeSingle()
  if (antes.error || !antes.data) {
    item(false, `lê ${PROJETO}`, antes.error?.message ?? 'não achei; rode supabase/exemplo.sql')
  } else {
    const original = antes.data.etapa
    const nova = etapaDeTroca(original)
    try {
      const muda = await logado.from('projetos').update({ etapa: nova }).eq('projeto', PROJETO).select('etapa')
      item(!muda.error && muda.data?.length === 1 && muda.data[0].etapa === nova,
        `muda a etapa de ${PROJETO}`, muda.error?.message ?? `${original} para ${nova}`)
    } finally {
      const volta = await logado.from('projetos').update({ etapa: original }).eq('projeto', PROJETO).select('etapa')
      const voltou = !volta.error && volta.data?.length === 1 && volta.data[0].etapa === original
      item(voltou, `devolve a etapa de ${PROJETO}`,
        voltou ? original : `NÃO VOLTOU: ponha "${original}" de volta à mão (${volta.error?.message ?? 'sem linha'})`)
    }
  }

  const motivo = await logado.from('motivos').insert({ nome: `EXEMPLO-CONFERENCIA-${Date.now()}` }).select()
  item(negado(motivo), 'inserir em motivos é negado',
    motivo.error ? `${motivo.error.code ?? 'sem código'}: ${motivo.error.message}` : negado(motivo) ? '' : 'a linha entrou! apague à mão')

  const fn = await logado.functions.invoke('usuarios', { body: { acao: 'reativar', id: randomUUID() } })
  const status = statusDoErro(fn.error)
  item(status === 403, 'a função usuarios responde 403', `status ${status ?? 'sem resposta'}`)

  // 5. Novidades (002_novidades.sql): a equipe lê a fila, mas só administrador decide.
  // O id -1 não existe: mesmo se a regra falhasse, nada seria aceito.
  const fila = await logado.from('novidades').select('id').limit(1)
  item(!fila.error, 'lê as novidades',
    fila.error ? `${fila.error.code ?? 'sem código'}: ${fila.error.message} (rodou o 002_novidades.sql?)` : '')
  const aceitar = await logado.rpc('aceitar_novidade', { p_id: -1 })
  item(soAdministrador(aceitar.error), 'aceitar novidade é negado',
    aceitar.error ? `${aceitar.error.code ?? 'sem código'}: ${aceitar.error.message}` : 'a função aceitou a chamada!')

  await logado.auth.signOut({ scope: 'local' })
} catch (e) {
  item(false, 'a conferência terminou sem erro inesperado', e instanceof Error ? e.message : 'erro desconhecido')
}

console.log(falhas ? `\n${falhas} item(ns) FALHOU.` : '\nTudo OK.')
process.exit(falhas ? 1 : 0)
