// Novidades da Enel: a fila que o importador monta e o administrador aceita ou recusa (funções do 002_novidades.sql).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FiltroRegional, Regional } from '../dominio/tipos'

export type TipoNovidade = 'novo' | 'mudou' | 'saiu' | 'corrigido'

export interface Novidade {
  id: number
  regional: Regional
  projeto: string
  tipo: TipoNovidade
  /** Formato por tipo, como o enviar_demanda grava (ver resumo.ts). */
  dados: unknown
  criada_em: string
}

export interface UltimaImportacao {
  regional: Regional
  tipo: 'demanda' | 'erro'
  quando: string
  resumo: { avisos?: string[] } & Record<string, unknown>
  erro: string | null
}

/** O que a carteira sabe hoje do projeto de uma novidade (mudou, saiu, corrigido). */
export interface InfoProjeto {
  projeto: string
  municipio: string | null
  prioridade: number | null
  etapa: string
}

export const REGIONAIS: readonly Regional[] = ['CS', 'SUL', 'LESTE']

const LIMITE_MS = 15_000 // sem resposta em 15 s, a gravação é tratada como sem conexão
const TAMANHO_PAGINA = 1000 // o Supabase devolve no máximo 1000 linhas por pedido
const LOTE_PROJETOS = 150 // nomes por pedido no filtro "in" (a URL não pode crescer demais)

/** Só as abertas, em ordem de tipo e projeto. */
export async function listarNovidades(c: SupabaseClient, r: FiltroRegional): Promise<Novidade[]> {
  const todas: Novidade[] = []
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    let q = c.from('novidades').select('id, regional, projeto, tipo, dados, criada_em').eq('situacao', 'aberta')
    if (r !== 'TODAS') q = q.eq('regional', r)
    const { data, error } = await q.order('tipo').order('projeto').order('regional').range(de, de + TAMANHO_PAGINA - 1)
    if (error) throw error
    const pagina = (data ?? []) as Novidade[]
    todas.push(...pagina)
    if (pagina.length < TAMANHO_PAGINA) return todas
  }
}

/** A última leitura (demanda ou erro) de cada regional; regional sem nenhuma fica de fora. */
export async function ultimasImportacoes(c: SupabaseClient): Promise<UltimaImportacao[]> {
  const respostas = await Promise.all(
    REGIONAIS.map((r) =>
      c
        .from('importacoes')
        .select('regional, tipo, quando, resumo, erro')
        .eq('regional', r)
        .in('tipo', ['demanda', 'erro'])
        .order('quando', { ascending: false })
        .limit(1),
    ),
  )
  const saida: UltimaImportacao[] = []
  for (const { data, error } of respostas) {
    if (error) throw error
    const linha = (data ?? [])[0] as UltimaImportacao | undefined
    if (linha) saida.push({ ...linha, resumo: linha.resumo ?? {} })
  }
  return saida
}

/** Município, prioridade e etapa dos projetos que já estão na carteira. */
export async function infoDosProjetos(c: SupabaseClient, projetos: string[]): Promise<Map<string, InfoProjeto>> {
  const mapa = new Map<string, InfoProjeto>()
  const unicos = [...new Set(projetos)]
  for (let i = 0; i < unicos.length; i += LOTE_PROJETOS) {
    const { data, error } = await c
      .from('projetos')
      .select('projeto, municipio, prioridade, etapa')
      .in('projeto', unicos.slice(i, i + LOTE_PROJETOS))
    if (error) throw error
    for (const p of (data ?? []) as InfoProjeto[]) mapa.set(p.projeto, p)
  }
  return mapa
}

async function chamar(c: SupabaseClient, funcao: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await c.rpc(funcao, args).abortSignal(AbortSignal.timeout(LIMITE_MS))
  if (error) throw error
  return data
}

/** saiu pede MANTER, TRANSFERIDA ou NÃO EXECUTÁVEL; corrigido pede EXECUTADO ou TIRAR; novo e mudou, nada. */
export async function aceitarNovidade(c: SupabaseClient, id: number, escolha?: string): Promise<void> {
  await chamar(c, 'aceitar_novidade', escolha === undefined ? { p_id: id } : { p_id: id, p_escolha: escolha })
}

/** Só novo e mudou. Tudo ou nada: devolve quantas foram aceitas. */
export async function aceitarEmLote(c: SupabaseClient, ids: number[]): Promise<number> {
  return Number(await chamar(c, 'aceitar_novidades', { p_ids: ids })) || 0
}

export async function recusarNovidade(c: SupabaseClient, id: number): Promise<void> {
  await chamar(c, 'recusar_novidade', { p_id: id })
}
