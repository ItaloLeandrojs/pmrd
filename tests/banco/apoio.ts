import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const PASTA_SUPABASE = fileURLToPath(new URL('../../supabase/', import.meta.url))
const PASTA_MIGRACOES = join(PASTA_SUPABASE, 'migracoes')

/** Roda supabase/migracoes/*.sql em ordem de nome (001, 002, ...). */
export async function aplicarMigracoes(db: PGlite): Promise<void> {
  const arquivos = readdirSync(PASTA_MIGRACOES)
    .filter((nome) => nome.endsWith('.sql'))
    .sort()
  for (const nome of arquivos) {
    await db.exec(readFileSync(join(PASTA_MIGRACOES, nome), 'utf8'))
  }
}

/** Banco novo em memória: o "Supabase falso" e depois as migrações. */
export async function novoBanco(): Promise<PGlite> {
  const db = await PGlite.create()
  await db.exec(readFileSync(join(PASTA_SUPABASE, 'testes', 'auth-falso.sql'), 'utf8'))
  await aplicarMigracoes(db)
  return db
}

export type Quem = { id: string } | 'anon' | 'service'

function papelEClaims(quem: Quem): { papel: string; claims: Record<string, string> } {
  if (quem === 'anon') return { papel: 'anon', claims: { role: 'anon' } }
  if (quem === 'service') return { papel: 'service_role', claims: { role: 'service_role' } }
  return { papel: 'authenticated', claims: { sub: quem.id, role: 'authenticated' } }
}

/**
 * Roda o SQL como o site rodaria pelo PostgREST: numa transação, com o papel
 * do Supabase e o JWT em request.jwt.claims. Erro desfaz a transação.
 */
export async function como<T = Record<string, unknown>>(
  db: PGlite,
  quem: Quem,
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const { papel, claims } = papelEClaims(quem)
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.query(`set local role ${papel}`)
    const resultado = await tx.query<T>(sql, params)
    return resultado.rows
  })
}

let contador = 0

/** Cria uma conta fictícia (o gatilho cria o perfil) e ajusta papel e ativo. Devolve o id. */
export async function criarPessoa(
  db: PGlite,
  { papel, ativo = true }: { papel: 'admin' | 'equipe' | 'importador'; ativo?: boolean },
): Promise<string> {
  contador += 1
  const email = `exemplo-${contador}@exemplo.test`
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id`,
    [email],
  )
  const id = rows[0].id
  await db.query(`update public.perfis set papel = $2, ativo = $3 where id = $1`, [id, papel, ativo])
  return id
}
