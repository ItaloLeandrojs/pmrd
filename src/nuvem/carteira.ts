// Leitura e gravação da Carteira. A gravação só vale se ninguém mexeu na linha antes (atualizado_em).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Etapa } from '../dominio/etapas'
import type { DataISO, FiltroRegional, Regional } from '../dominio/tipos'
import type { NovoProjeto } from '../telas/carteira/novoProjeto'
import { normalizarProjeto } from '../telas/carteira/novoProjeto'
import { mensagemDeErro } from './erros'

export interface ProjetoLinha {
  projeto: string
  regional: Regional
  origem: 'enel' | 'manual'
  municipio: string | null
  prioridade: number | null
  pedido_gestor: boolean
  pedido_gestor_em: DataISO | null
  pedido_gestor_por: string | null
  qtd_defeitos: number
  alimentadores: string[]
  etapa: Etapa
  etapa_desde: string
  proxima_acao: string | null
  prazo_proxima_acao: DataISO | null
  vistoria_data: DataISO | null
  responsavel: string | null
  atualizado_em: string
}

export type EditavelLinha = Partial<
  Pick<
    ProjetoLinha,
    'etapa' | 'proxima_acao' | 'prazo_proxima_acao' | 'responsavel' | 'pedido_gestor' | 'pedido_gestor_em' | 'pedido_gestor_por'
  >
>

export type ResultadoGravacao =
  | { ok: true; linha: ProjetoLinha }
  | { ok: false; motivo: 'conflito' | 'sem-permissao' | 'rede'; mensagem: string; atual?: ProjetoLinha }

export const MSG_CONFLITO = 'Outra pessoa mudou este projeto. Recarreguei a linha.'
export const MSG_REDE = 'Não salvou: sem conexão. A mudança foi desfeita.'
export const MSG_SEM_PERMISSAO = 'Sem permissão para mudar este projeto.'

const COLUNAS =
  'projeto, regional, origem, municipio, prioridade, pedido_gestor, pedido_gestor_em, pedido_gestor_por, alimentadores, etapa, etapa_desde, ' +
  'proxima_acao, prazo_proxima_acao, vistoria_data, responsavel, atualizado_em, qtd_defeitos_informada, defeitos(situacao)'

const LIMITE_MS = 15_000 // sem resposta em 15 s, a gravação é tratada como sem conexão
const TAMANHO_PAGINA = 1000 // o Supabase devolve no máximo 1000 linhas por pedido

interface LinhaBruta extends Omit<ProjetoLinha, 'qtd_defeitos'> {
  qtd_defeitos_informada: number | null
  defeitos: { situacao: string }[] | null
}

function paraLinha(b: LinhaBruta): ProjetoLinha {
  const { qtd_defeitos_informada, defeitos, ...resto } = b
  const lista = defeitos ?? []
  const qtd_defeitos =
    lista.length > 0 ? lista.filter((d) => d.situacao !== 'removido').length : (qtd_defeitos_informada ?? 0)
  return {
    ...resto,
    pedido_gestor_em: resto.pedido_gestor_em ?? null,
    pedido_gestor_por: resto.pedido_gestor_por ?? null,
    alimentadores: resto.alimentadores ?? [],
    qtd_defeitos,
  }
}

export async function listarProjetos(c: SupabaseClient, r: FiltroRegional): Promise<ProjetoLinha[]> {
  const todas: ProjetoLinha[] = []
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    let q = c.from('projetos').select(COLUNAS)
    if (r !== 'TODAS') q = q.eq('regional', r)
    const { data, error } = await q.order('projeto').range(de, de + TAMANHO_PAGINA - 1)
    if (error) throw error
    const pagina = (data ?? []) as unknown as LinhaBruta[]
    todas.push(...pagina.map(paraLinha))
    if (pagina.length < TAMANHO_PAGINA) return todas
  }
}

function ehErroDeRede(e: unknown): boolean {
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) return true
  const o = (typeof e === 'object' && e !== null ? e : {}) as { name?: unknown; message?: unknown }
  const msg = typeof o.message === 'string' ? o.message : ''
  if (o.name === 'FetchError' || o.name === 'AbortError' || o.name === 'TimeoutError') return true
  return /failed to fetch|networkerror|load failed|AbortError|TimeoutError/i.test(msg)
}

export async function atualizarProjeto(
  c: SupabaseClient,
  projeto: string,
  conhecidoEm: string,
  mudancas: EditavelLinha,
): Promise<ResultadoGravacao> {
  try {
    // conhecidoEm vai exatamente como veio do banco: passar por Date perderia os microssegundos.
    const { data, error } = await c
      .from('projetos')
      .update(mudancas)
      .eq('projeto', projeto)
      .eq('atualizado_em', conhecidoEm)
      .select(COLUNAS)
      .abortSignal(AbortSignal.timeout(LIMITE_MS))
    if (error) throw error
    if (data && data.length > 0) return { ok: true, linha: paraLinha(data[0] as unknown as LinhaBruta) }

    // Nenhuma linha mudou: ou alguém chegou antes, ou o banco barrou por permissão.
    const { data: atualBruto, error: erroLeitura } = await c
      .from('projetos')
      .select(COLUNAS)
      .eq('projeto', projeto)
      .abortSignal(AbortSignal.timeout(LIMITE_MS))
      .maybeSingle()
    if (erroLeitura) throw erroLeitura
    if (!atualBruto) return { ok: false, motivo: 'sem-permissao', mensagem: MSG_SEM_PERMISSAO }
    const atual = paraLinha(atualBruto as unknown as LinhaBruta)
    if (atual.atualizado_em !== conhecidoEm) return { ok: false, motivo: 'conflito', mensagem: MSG_CONFLITO, atual }
    return { ok: false, motivo: 'sem-permissao', mensagem: MSG_SEM_PERMISSAO }
  } catch (e) {
    if (ehErroDeRede(e)) return { ok: false, motivo: 'rede', mensagem: MSG_REDE }
    throw e
  }
}

// ---------------------------------------------------------------------------
// Ficha do projeto e projeto novo à mão (Tarefa 9)
// ---------------------------------------------------------------------------

export interface Defeito {
  id_gom: string
  prioridade: number | null
  estrutura: string | null
  alimentador: string | null
  situacao: 'pendente' | 'programado' | 'executado' | 'removido'
}

export interface FichaProjeto {
  projeto: ProjetoLinha & {
    ot_correcao: string | null
    endereco: string | null
    elemento_corte: string | null
    qtd_clientes: number | null
    estruturas: string[]
    intervencao_prevista: string | null
    vistoria_situacao: string | null
    vistoria_recurso: string | null
    vistoria_intervencao: string | null
    vistoria_observacao: string | null
    vistoria_enviada_em: DataISO | null
    saiu_da_demanda: boolean
  }
  defeitos: Defeito[]
  /** Uma entrada por mudança, mais recente primeiro. `quem` é o id do perfil ('' quando o banco não guardou). */
  historico: { quando: string; quem: string; antes: Record<string, unknown>; depois: Record<string, unknown> }[]
}

const COLUNAS_FICHA =
  COLUNAS +
  ', ot_correcao, endereco, elemento_corte, qtd_clientes, estruturas, intervencao_prevista, vistoria_situacao, ' +
  'vistoria_recurso, vistoria_intervencao, vistoria_observacao, vistoria_enviada_em, saiu_da_demanda'
const LIMITE_HISTORICO = 100

export const MSG_PROJETO_NAO_ENCONTRADO = 'Projeto não encontrado.'

/** Lê projeto, defeitos e histórico de um projeto. Lança em caso de erro (a tela mostra mensagemDeErro). */
export async function carregarFicha(c: SupabaseClient, projeto: string): Promise<FichaProjeto> {
  const sinal = () => AbortSignal.timeout(LIMITE_MS)
  const [p, d, h] = await Promise.all([
    c.from('projetos').select(COLUNAS_FICHA).eq('projeto', projeto).abortSignal(sinal()).maybeSingle(),
    c
      .from('defeitos')
      .select('id_gom, prioridade, estrutura, alimentador, situacao')
      .eq('projeto', projeto)
      .order('id_gom')
      .abortSignal(sinal()),
    c
      .from('historico')
      .select('quando, quem, antes, depois')
      .eq('tabela', 'projetos')
      .eq('chave', projeto)
      .order('quando', { ascending: false })
      .limit(LIMITE_HISTORICO)
      .abortSignal(sinal()),
  ])
  if (p.error) throw p.error
  if (d.error) throw d.error
  if (h.error) throw h.error
  if (!p.data) throw new Error(MSG_PROJETO_NAO_ENCONTRADO)
  const linha = paraLinha(p.data as unknown as LinhaBruta) as FichaProjeto['projeto']
  linha.estruturas = linha.estruturas ?? []
  const historico = ((h.data ?? []) as { quando: string; quem: string | null; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null }[]).map(
    (x) => ({ quando: x.quando, quem: x.quem ?? '', antes: x.antes ?? {}, depois: x.depois ?? {} }),
  )
  return { projeto: linha, defeitos: (d.data ?? []) as Defeito[], historico }
}

export type ResultadoCriacao = { ok: true } | { ok: false; erro: string; projetoCriado?: boolean }

const MSG_PROJETO_REPETIDO = 'Este projeto já está na carteira.'

function codigoDoErro(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : undefined
}

/** Por que os ID GOM não entraram, em português. */
function motivoDosDefeitos(e: unknown): string {
  if (ehErroDeRede(e)) return 'sem conexão. Confira a internet ou a VPN.'
  if (codigoDoErro(e) === '23505') return 'algum desses ID GOM já existe em outro projeto.'
  if (codigoDoErro(e) === '42501') return 'sem permissão para gravar defeitos.'
  return mensagemDeErro(e)
}

const MSG_SEM_SABER =
  'A conexão caiu e não dá para saber se o projeto entrou. Feche, atualize a carteira e procure por ele antes de tentar de novo.'

/** true/false se o banco respondeu; null se nem a conferência chegou. */
async function projetoExiste(c: SupabaseClient, projeto: string): Promise<boolean | null> {
  try {
    const { data, error } = await c
      .from('projetos')
      .select('projeto')
      .eq('projeto', projeto)
      .abortSignal(AbortSignal.timeout(LIMITE_MS))
      .maybeSingle()
    if (error) return null
    return data !== null
  } catch {
    return null
  }
}

/**
 * Cria o projeto à mão e depois os defeitos pendentes (dois pedidos; o banco não tem função para os dois juntos).
 * Se os defeitos falharem, o projeto já entrou: o resultado diz isso (projetoCriado) e o porquê.
 */
export async function criarProjetoManual(c: SupabaseClient, n: NovoProjeto): Promise<ResultadoCriacao> {
  const projeto = normalizarProjeto(n.projeto)
  const ids = [...new Set((n.ids_gom ?? []).map((x) => x.trim()).filter((x) => x !== ''))]
  const limpo = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)

  try {
    const { error } = await c
      .from('projetos')
      .insert({
        projeto,
        regional: n.regional,
        origem: 'manual',
        etapa: 'EM ANÁLISE',
        municipio: n.municipio.trim(),
        prioridade: n.prioridade,
        ot_correcao: limpo(n.ot_correcao),
        endereco: limpo(n.endereco),
        intervencao_prevista: limpo(n.intervencao_prevista),
        // Com ID GOM, a quantidade fica gravada também: se os defeitos falharem, o projeto não fica com 0.
        qtd_defeitos_informada: ids.length === 0 ? (n.qtd_defeitos ?? null) : ids.length,
      })
      .abortSignal(AbortSignal.timeout(LIMITE_MS))
    if (error) throw error
  } catch (e) {
    if (codigoDoErro(e) === '23505') return { ok: false, erro: MSG_PROJETO_REPETIDO }
    if (!ehErroDeRede(e)) return { ok: false, erro: `Não salvou: ${mensagemDeErro(e)}` }
    // Tempo limite ou queda: o banco pode ter gravado mesmo sem a resposta chegar. Confere antes de dizer.
    const existe = await projetoExiste(c, projeto)
    if (existe === false) return { ok: false, erro: 'Não salvou: sem conexão. Confira a internet ou a VPN.' }
    if (existe === null) return { ok: false, erro: MSG_SEM_SABER }
    // Gravou: segue para os defeitos como se a resposta tivesse chegado.
  }

  if (ids.length === 0) return { ok: true }
  try {
    const { error } = await c
      .from('defeitos')
      .insert(ids.map((id_gom) => ({ id_gom, projeto, prioridade: n.prioridade, situacao: 'pendente' })))
      .abortSignal(AbortSignal.timeout(LIMITE_MS))
    if (error) throw error
    return { ok: true }
  } catch (e) {
    return { ok: false, projetoCriado: true, erro: `O projeto entrou, mas sem os ID GOM: ${motivoDosDefeitos(e)}` }
  }
}
