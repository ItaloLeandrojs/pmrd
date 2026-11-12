// Textos curtos da tela Novidades (puros, sem React): resumo de cada cartão e situação da última importação.
import { hojeEmFortaleza, somarDias } from '../../dominio/datas'
import { PRIORIDADES } from '../../dominio/prioridades'
import type { Regional } from '../../dominio/tipos'
import type { Novidade, UltimaImportacao } from '../../nuvem/novidades'

/** Defeito como o enviar_demanda guarda no dados (novo e mudou). */
export interface DefeitoEnel {
  id_gom: string
  prioridade: number | null
  estrutura?: string | null
  alimentador?: string | null
  estado_enel?: string | null
}

export interface DadosNovo { projeto: string; municipio: string | null; alimentadores: string[]; defeitos: DefeitoEnel[] }
export interface DadosMudou {
  entram: DefeitoEnel[]
  saem: string[]
  prioridade_antes: number | null
  prioridade_nova: number | null
  alimentadores: string[]
}
export interface DadosSaiu { etapa: string }
export interface DadosCorrigido { defeitos: { id_gom: string; estado_enel: string | null }[] }

export const NOME_REGIONAL: Record<Regional, string> = { CS: 'CS', SUL: 'Sul', LESTE: 'Leste' }

const HORAS_SEM_LEITURA = 26
const HORA_MS = 3_600_000

const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const objeto = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function dadosNovo(n: Novidade): DadosNovo {
  const d = objeto(n.dados)
  return {
    projeto: typeof d.projeto === 'string' ? d.projeto : n.projeto,
    municipio: typeof d.municipio === 'string' && d.municipio.trim() !== '' ? d.municipio : null,
    alimentadores: lista<string>(d.alimentadores),
    defeitos: lista<DefeitoEnel>(d.defeitos),
  }
}

export function dadosMudou(n: Novidade): DadosMudou {
  const d = objeto(n.dados)
  return {
    entram: lista<DefeitoEnel>(d.entram),
    saem: lista<string>(d.saem),
    prioridade_antes: numero(d.prioridade_antes),
    prioridade_nova: numero(d.prioridade_nova),
    alimentadores: lista<string>(d.alimentadores),
  }
}

export function dadosSaiu(n: Novidade): DadosSaiu {
  const etapa = objeto(n.dados).etapa
  return { etapa: typeof etapa === 'string' ? etapa : '-' }
}

export function dadosCorrigido(n: Novidade): DadosCorrigido {
  return { defeitos: lista<{ id_gom: string; estado_enel: string | null }>(objeto(n.dados).defeitos) }
}

const defeitos = (q: number) => `${q} ${q === 1 ? 'defeito' : 'defeitos'}`

/** "prioridade 7 (Conj. crítico)" ou "sem prioridade" (ordem 6.3). */
export function textoPrioridade(p: number | null): string {
  if (p === null) return 'sem prioridade'
  const nome = PRIORIDADES[p]
  return nome ? `prioridade ${p} (${nome})` : `prioridade ${p}`
}

/** A prioridade do projeto novo é a menor entre os defeitos. */
export function prioridadeDoNovo(d: DadosNovo): number | null {
  const ps = d.defeitos.map((x) => numero(x.prioridade)).filter((p): p is number => p !== null)
  return ps.length === 0 ? null : Math.min(...ps)
}

export function resumoDaNovidade(n: Novidade): string {
  if (n.tipo === 'novo') {
    const d = dadosNovo(n)
    return `${defeitos(d.defeitos.length)}, ${textoPrioridade(prioridadeDoNovo(d))}`
  }
  if (n.tipo === 'mudou') {
    const d = dadosMudou(n)
    const partes: string[] = []
    if (d.entram.length > 0) partes.push(`+${defeitos(d.entram.length)}`)
    if (d.saem.length > 0) partes.push(`-${defeitos(d.saem.length)}`)
    if (d.prioridade_nova !== null) {
      partes.push(
        d.prioridade_antes === null
          ? `passa a ter prioridade ${d.prioridade_nova}`
          : `prioridade ${d.prioridade_antes} para ${d.prioridade_nova}`,
      )
    }
    return partes.length > 0 ? partes.join(', ') : 'Mudaram os alimentadores'
  }
  if (n.tipo === 'saiu') return `Não está mais na demanda da Enel (etapa: ${dadosSaiu(n).etapa})`

  const d = dadosCorrigido(n)
  const q = d.defeitos.length
  const porEstado = new Map<string, number>()
  for (const x of d.defeitos) {
    const e = x.estado_enel && x.estado_enel.trim() !== '' ? x.estado_enel : 'sem estado'
    porEstado.set(e, (porEstado.get(e) ?? 0) + 1)
  }
  const estados =
    porEstado.size === 1 ? [...porEstado.keys()][0] : [...porEstado].map(([e, k]) => `${e} (${k})`).join(', ')
  return `${defeitos(q)} ${q === 1 ? 'fechado' : 'fechados'} na Enel: ${estados}`
}

const formatadorDiaHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Fortaleza',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function partes(iso: string): { dia: string; mes: string; hora: string; minuto: string } {
  const p = Object.fromEntries(formatadorDiaHora.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { dia: p.day, mes: p.month, hora: p.hour, minuto: p.minute }
}

/** "DD/MM HH:MM" no fuso de Fortaleza. */
export function formatarDiaHora(iso: string): string {
  const p = partes(iso)
  return `${p.dia}/${p.mes} ${p.hora}:${p.minuto}`
}

/** "hoje às 09:00", "ontem às 09:00" ou "em 08/11 às 09:00", pelo dia de Fortaleza. */
function quandoFoi(iso: string, agora: Date): string {
  const p = partes(iso)
  const dia = hojeEmFortaleza(new Date(iso))
  const hoje = hojeEmFortaleza(agora)
  const hora = `${p.hora}:${p.minuto}`
  if (dia === hoje) return `hoje às ${hora}`
  if (dia === somarDias(hoje, -1)) return `ontem às ${hora}`
  return `em ${p.dia}/${p.mes} às ${hora}`
}

export type NivelImportacao = 'ok' | 'velha' | 'erro' | 'nenhuma'

/** Situação da última leitura de uma regional, sempre escrita (a cor só reforça). */
export function textoImportacao(
  regional: Regional,
  imp: UltimaImportacao | undefined,
  agora: Date,
): { nivel: NivelImportacao; texto: string; detalhe?: string } {
  const nome = NOME_REGIONAL[regional]
  if (!imp) return { nivel: 'nenhuma', texto: `${nome}: nenhuma importação ainda` }
  if (imp.tipo === 'erro') {
    return {
      nivel: 'erro',
      texto: `${nome}: a leitura de ${quandoFoi(imp.quando, agora)} deu erro`,
      detalhe: imp.erro?.trim() || 'O importador não disse o motivo.',
    }
  }
  if (agora.getTime() - new Date(imp.quando).getTime() > HORAS_SEM_LEITURA * HORA_MS) {
    // O importador não grava nada quando a planilha não muda (fim de semana, por exemplo).
    return { nivel: 'velha', texto: `${nome}: sem planilha nova desde ${formatarDiaHora(imp.quando)}` }
  }
  return { nivel: 'ok', texto: `${nome}: lida ${quandoFoi(imp.quando, agora)}` }
}

/** Avisos da última leitura (texto), ignorando o que não for texto. */
export function avisosDe(imp: UltimaImportacao | undefined): string[] {
  return lista<unknown>(imp?.resumo?.avisos).filter((a): a is string => typeof a === 'string' && a.trim() !== '')
}
