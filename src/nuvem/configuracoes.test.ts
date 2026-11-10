import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  novoMotivo, novoSolicitante, salvarEquipe, salvarMotivo, salvarParametros, salvarSolicitante,
  type Equipe, type Parametros,
} from './configuracoes'
import { NadaGravado } from './erros'

type Resposta = { data: unknown[] | null; error: unknown }

/** Cliente falso: toda gravação devolve a mesma resposta e anota se pediu as linhas de volta. */
function clienteFalso(r: Resposta) {
  const ops: string[] = []
  const b: Record<string, unknown> = {}
  for (const op of ['upsert', 'insert', 'update', 'eq', 'select']) {
    b[op] = () => { ops.push(op); return b }
  }
  b.then = (ok: (x: Resposta) => unknown, falha: (e: unknown) => unknown) => Promise.resolve(r).then(ok, falha)
  const c = { from: () => b }
  return { c: c as unknown as SupabaseClient, ops }
}

const EQUIPE: Equipe = {
  lid: 'EXEMPLO-ML-01', chefe: 'EXEMPLO', tipo: 'ML', regional: 'CS', grupo_report: null, base: null, ativa: true, foto_path: null,
}
const PARAMETROS: Parametros = {
  validade_vistoria: 30, prazo_reenvio_vistoria: 5, alerta_vencimento: 7, alerta_prazo: 2,
  parado_amarelo: 7, parado_vermelho: 15, raio_mapa_km: 10,
}

const GRAVACOES: [string, (c: SupabaseClient) => Promise<void>][] = [
  ['salvarEquipe', (c) => salvarEquipe(c, EQUIPE)],
  ['novoMotivo', (c) => novoMotivo(c, 'CHUVA', 1)],
  ['salvarMotivo', (c) => salvarMotivo(c, { id: 'm1', nome: 'CHUVA', ordem: 1, ativo: false })],
  ['novoSolicitante', (c) => novoSolicitante(c, 'EXEMPLO', null)],
  ['salvarSolicitante', (c) => salvarSolicitante(c, { id: 's1', nome: 'EXEMPLO', email: null, ativo: false })],
  ['salvarParametros', (c) => salvarParametros(c, PARAMETROS)],
]

describe('gravações das Configurações', () => {
  it.each(GRAVACOES)('%s pede as linhas de volta e aceita 1 linha', async (_nome, gravar) => {
    const { c, ops } = clienteFalso({ data: [{ id: 'x' }], error: null })
    await expect(gravar(c)).resolves.toBeUndefined()
    expect(ops).toContain('select')
  })

  it.each(GRAVACOES)('%s com 0 linhas (recusa silenciosa) vira NadaGravado', async (_nome, gravar) => {
    const { c } = clienteFalso({ data: [], error: null })
    await expect(gravar(c)).rejects.toBeInstanceOf(NadaGravado)
  })

  it.each(GRAVACOES)('%s repassa o erro do banco', async (_nome, gravar) => {
    const erro = { message: 'falhou', code: '42501' }
    const { c } = clienteFalso({ data: null, error: erro })
    await expect(gravar(c)).rejects.toBe(erro)
  })
})
