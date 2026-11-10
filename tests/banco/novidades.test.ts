import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { aplicarMigracoes, como, criarPessoa, novoBanco } from './apoio'

let modelo: PGlite
let db: PGlite

beforeAll(async () => {
  modelo = await novoBanco()
}, 60_000)

afterAll(async () => {
  await modelo.close()
})

async function preparar(): Promise<void> {
  db = (await modelo.clone()) as PGlite
  await db.query(`insert into public.projetos (projeto, regional) values ('EXEMPLO-0001', 'SUL')`)
  await db.query(
    `insert into public.importacoes (tipo, regional, arquivo) values ('demanda', 'SUL', 'EXEMPLO-demanda.xlsx')`,
  )
  await db.query(
    `insert into public.novidades (importacao_id, regional, projeto, tipo, dados, assinatura)
     values (1, 'SUL', 'EXEMPLO-0001', 'novo', '{}', 'EXEMPLO-assinatura')`,
  )
}

describe('002_novidades: importador', () => {
  beforeEach(preparar)

  it('importador ativo não é do PCM e não vê projetos nem novidades', async () => {
    const id = await criarPessoa(db, { papel: 'importador' })
    expect(await como(db, { id }, 'select count(*)::int as n from public.projetos')).toEqual([{ n: 0 }])
    expect(await como(db, { id }, 'select count(*)::int as n from public.novidades')).toEqual([{ n: 0 }])
    expect(await como(db, { id }, 'select count(*)::int as n from public.importacoes')).toEqual([{ n: 0 }])
    expect(await como(db, { id }, 'select public.eh_do_pcm() as v')).toEqual([{ v: false }])
    expect(await como(db, { id }, 'select public.eh_importador() as v')).toEqual([{ v: true }])
  })

  it('importador não escreve em novidades', async () => {
    const id = await criarPessoa(db, { papel: 'importador' })
    await expect(
      como(
        db,
        { id },
        `insert into public.novidades (importacao_id, regional, projeto, tipo, dados, assinatura)
         values (1, 'SUL', 'EXEMPLO-0002', 'novo', '{}', 'x')`,
      ),
    ).rejects.toThrow()
  })

  it('o importador ainda lê o próprio perfil', async () => {
    const id = await criarPessoa(db, { papel: 'importador' })
    expect(await como(db, { id }, 'select papel from public.perfis')).toEqual([{ papel: 'importador' }])
  })

  it('importador desativado não é importador', async () => {
    const id = await criarPessoa(db, { papel: 'importador', ativo: false })
    expect(await como(db, { id }, 'select public.eh_importador() as v')).toEqual([{ v: false }])
  })

  it('equipe lê novidades e importações, mas não escreve', async () => {
    const id = await criarPessoa(db, { papel: 'equipe' })
    expect(await como(db, { id }, 'select count(*)::int as n from public.novidades')).toEqual([{ n: 1 }])
    expect(await como(db, { id }, 'select count(*)::int as n from public.importacoes')).toEqual([{ n: 1 }])
    await expect(
      como(db, { id }, `update public.novidades set situacao = 'aceita'`),
    ).rejects.toThrow()
    await expect(
      como(db, { id }, `insert into public.importacoes (tipo) values ('carga')`),
    ).rejects.toThrow()
  })

  it('admin ativo continua do PCM', async () => {
    const id = await criarPessoa(db, { papel: 'admin' })
    expect(await como(db, { id }, 'select public.eh_do_pcm() as v')).toEqual([{ v: true }])
  })

  it('anon lê 0 linhas de novidades e importações', async () => {
    await expect(como(db, 'anon', 'select * from public.novidades')).rejects.toThrow()
    await expect(como(db, 'anon', 'select * from public.importacoes')).rejects.toThrow()
  })

  it('só uma novidade aberta por regional, projeto e tipo', async () => {
    await expect(
      db.query(
        `insert into public.novidades (importacao_id, regional, projeto, tipo, dados, assinatura)
         values (1, 'SUL', 'EXEMPLO-0001', 'novo', '{"a":1}', 'outra')`,
      ),
    ).rejects.toThrow()
    await db.query(`update public.novidades set situacao = 'recusada'`)
    await db.query(
      `insert into public.novidades (importacao_id, regional, projeto, tipo, dados, assinatura)
       values (1, 'SUL', 'EXEMPLO-0001', 'novo', '{"a":1}', 'outra')`,
    )
  })

  it('rodar as migrações de novo não dá erro', async () => {
    await aplicarMigracoes(db)
  })
})

// ---------------------------------------------------------------
// Tarefa 2: enviar_demanda e registrar_erro_importacao
// ---------------------------------------------------------------
type Defeito = {
  id_gom: string
  prioridade: number | null
  estrutura: string
  alimentador: string
  estado_enel: string
  lat: number
  lng: number
}
type ProjetoEnvio = { projeto: string; municipio: string; alimentadores: string[]; defeitos: Defeito[] }
type Envio = {
  projetos: ProjetoEnvio[]
  presentes: string[]
  fechados?: { id_gom: string; estado_enel: string }[]
  avisos?: string[]
}
type Novidade = {
  id: number
  regional: string
  projeto: string
  tipo: string
  situacao: string
  assinatura: string
  dados: Record<string, unknown>
}

function defeito(id_gom: string, prioridade: number | null = 7): Defeito {
  return {
    id_gom,
    prioridade,
    estrutura: 'EXEMPLO-ESTR',
    alimentador: 'EXE01S1',
    estado_enel: 'PENDENTE',
    lat: -7.2,
    lng: -39.4,
  }
}

function projetoEnvio(projeto: string, ids: string[], alimentadores = ['EXE01S1']): ProjetoEnvio {
  return { projeto, municipio: 'Exemplópolis', alimentadores, defeitos: ids.map((id) => defeito(id)) }
}

const idsDe = (lista: unknown) => (lista as { id_gom: string }[]).map((d) => d.id_gom)

describe('002_novidades: enviar_demanda', () => {
  let robo: string
  let equipe: string

  beforeEach(async () => {
    db = (await modelo.clone()) as PGlite
    robo = await criarPessoa(db, { papel: 'importador' })
    equipe = await criarPessoa(db, { papel: 'equipe' })
  })

  async function enviar(envio: Envio, regional = 'SUL'): Promise<Record<string, unknown>> {
    const linhas = await como<{ r: Record<string, unknown> }>(
      db,
      { id: robo },
      'select public.enviar_demanda($1, $2, $3::jsonb) as r',
      [regional, 'EXEMPLO-demanda.xlsx', JSON.stringify(envio)],
    )
    return linhas[0].r
  }

  async function novidades(): Promise<Novidade[]> {
    return como<Novidade>(
      db,
      { id: equipe },
      'select id, regional, projeto, tipo, situacao, assinatura, dados from public.novidades order by id',
    )
  }

  async function projetoNaCarteira(
    projeto: string,
    defeitos: { id: string; situacao?: string }[],
    { regional = 'SUL', origem = 'enel', prioridade = 7, etapa = 'EM ANÁLISE' } = {},
  ): Promise<void> {
    await db.query(
      `insert into public.projetos (projeto, regional, origem, prioridade, etapa, alimentadores)
       values ($1, $2, $3, $4, $5, '{EXE01S1}')`,
      [projeto, regional, origem, prioridade, etapa],
    )
    for (const d of defeitos) {
      await db.query(
        `insert into public.defeitos (id_gom, projeto, prioridade, situacao) values ($1, $2, 7, $3)`,
        [d.id, projeto, d.situacao ?? 'pendente'],
      )
    }
  }

  it('carteira vazia e 2 projetos no envio: 2 novidades novo', async () => {
    const envio: Envio = {
      projetos: [
        projetoEnvio('EXEMPLO-0001', ['-9000002', '-9000001']),
        projetoEnvio('EXEMPLO-0002', ['-9000003']),
      ],
      presentes: ['EXEMPLO-0001', 'EXEMPLO-0002'],
      avisos: ['Prioridade desconhecida: EXEMPLO (2 defeitos)'],
    }
    const resumo = await enviar(envio)
    expect(resumo).toMatchObject({
      novo: 2,
      mudou: 0,
      saiu: 0,
      corrigido: 0,
      avisos: ['Prioridade desconhecida: EXEMPLO (2 defeitos)'],
    })

    const lista = await novidades()
    expect(lista.map((n) => [n.regional, n.projeto, n.tipo, n.situacao])).toEqual([
      ['SUL', 'EXEMPLO-0001', 'novo', 'aberta'],
      ['SUL', 'EXEMPLO-0002', 'novo', 'aberta'],
    ])
    // O projeto inteiro do envio, com os defeitos em ordem de ID.
    expect(lista[0].dados).toMatchObject({
      projeto: 'EXEMPLO-0001',
      municipio: 'Exemplópolis',
      alimentadores: ['EXE01S1'],
    })
    expect(idsDe(lista[0].dados.defeitos)).toEqual(['-9000001', '-9000002'])

    const imp = await como<{ tipo: string; regional: string; arquivo: string; resumo: unknown }>(
      db,
      { id: equipe },
      'select tipo, regional, arquivo, resumo from public.importacoes',
    )
    expect(imp).toEqual([{ tipo: 'demanda', regional: 'SUL', arquivo: 'EXEMPLO-demanda.xlsx', resumo }])
  })

  it('o mesmo envio 2 vezes não cria nada novo e as abertas continuam abertas', async () => {
    const envio: Envio = {
      projetos: [projetoEnvio('EXEMPLO-0001', ['-9000001', '-9000002']), projetoEnvio('EXEMPLO-0002', ['-9000003'])],
      presentes: ['EXEMPLO-0001', 'EXEMPLO-0002'],
    }
    await enviar(envio)
    const antes = await novidades()
    // Mesma foto com os defeitos em outra ordem: mesma assinatura.
    envio.projetos[0].defeitos.reverse()
    const resumo = await enviar(envio)
    expect(resumo).toMatchObject({ novo: 0, mudou: 0, saiu: 0, corrigido: 0 })
    expect(await novidades()).toEqual(antes)
    expect(antes.map((n) => n.situacao)).toEqual(['aberta', 'aberta'])
  })

  it('mudou: entram os IDs novos e saem os que sumiram', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [{ id: '-9000001' }, { id: '-9000002' }])
    const resumo = await enviar({
      projetos: [projetoEnvio('EXEMPLO-0001', ['-9000003', '-9000001'])],
      presentes: ['EXEMPLO-0001'],
    })
    expect(resumo).toMatchObject({ novo: 0, mudou: 1, saiu: 0, corrigido: 0 })
    const [n] = await novidades()
    expect(n).toMatchObject({ projeto: 'EXEMPLO-0001', tipo: 'mudou', situacao: 'aberta' })
    expect(idsDe(n.dados.entram)).toEqual(['-9000003'])
    expect(n.dados.saem).toEqual(['-9000002'])
    expect(n.dados).toMatchObject({ prioridade_antes: 7, prioridade_nova: null, alimentadores: ['EXE01S1'] })
  })

  it('mudou recusado não volta com a mesma foto; volta se mudar de novo', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [{ id: '-9000001' }, { id: '-9000002' }])
    const envio: Envio = {
      projetos: [projetoEnvio('EXEMPLO-0001', ['-9000001', '-9000003'])],
      presentes: ['EXEMPLO-0001'],
    }
    await enviar(envio)
    await db.query(`update public.novidades set situacao = 'recusada'`)

    expect(await enviar(envio)).toMatchObject({ mudou: 0 })
    expect((await novidades()).map((n) => n.situacao)).toEqual(['recusada'])

    envio.projetos[0].defeitos.push(defeito('-9000004'))
    expect(await enviar(envio)).toMatchObject({ mudou: 1 })
    const lista = await novidades()
    expect(lista.map((n) => n.situacao)).toEqual(['recusada', 'aberta'])
    expect(idsDe(lista[1].dados.entram)).toEqual(['-9000003', '-9000004'])
  })

  it('mudou aberto com outra foto vira substituída e entra a nova', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [{ id: '-9000001' }])
    const envio: Envio = {
      projetos: [projetoEnvio('EXEMPLO-0001', ['-9000001', '-9000003'])],
      presentes: ['EXEMPLO-0001'],
    }
    await enviar(envio)
    envio.projetos[0].defeitos.push(defeito('-9000004'))
    await enviar(envio)
    const lista = await novidades()
    expect(lista.map((n) => [n.tipo, n.situacao])).toEqual([
      ['mudou', 'substituida'],
      ['mudou', 'aberta'],
    ])
    expect(lista[0].assinatura).not.toBe(lista[1].assinatura)
  })

  it('aberta antiga sai da fila quando a foto volta a uma já recusada', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [{ id: '-9000001' }])
    const recusada: Envio = {
      projetos: [projetoEnvio('EXEMPLO-0001', ['-9000001', '-9000003'])],
      presentes: ['EXEMPLO-0001'],
    }
    await enviar(recusada)
    await db.query(`update public.novidades set situacao = 'recusada'`)
    await enviar({ projetos: [projetoEnvio('EXEMPLO-0001', ['-9000001', '-9000004'])], presentes: ['EXEMPLO-0001'] })
    await enviar(recusada)
    expect((await novidades()).map((n) => n.situacao)).toEqual(['recusada', 'substituida'])
  })

  it('defeito fechado como CORRIGIDO vira corrigido e não aparece em saem', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [
      { id: '-9000001' },
      { id: '-9000002' },
      { id: '-9000005', situacao: 'programado' },
    ])
    const resumo = await enviar({
      projetos: [projetoEnvio('EXEMPLO-0001', ['-9000001', '-9000003'])],
      presentes: ['EXEMPLO-0001'],
      fechados: [
        { id_gom: '-9000005', estado_enel: 'EXECUTADA' },
        { id_gom: '-9000002', estado_enel: 'CORRIGIDO' },
        { id_gom: '-9000099', estado_enel: 'CORRIGIDO' },
      ],
    })
    expect(resumo).toMatchObject({ novo: 0, mudou: 1, saiu: 0, corrigido: 1 })
    const lista = await novidades()
    const mudou = lista.find((n) => n.tipo === 'mudou')!
    const corrigido = lista.find((n) => n.tipo === 'corrigido')!
    expect(mudou.dados.saem).toEqual([])
    expect(idsDe(mudou.dados.entram)).toEqual(['-9000003'])
    expect(corrigido).toMatchObject({ projeto: 'EXEMPLO-0001', situacao: 'aberta' })
    expect(corrigido.dados).toEqual({
      defeitos: [
        { id_gom: '-9000002', estado_enel: 'CORRIGIDO' },
        { id_gom: '-9000005', estado_enel: 'EXECUTADA' },
      ],
    })
  })

  it('defeito removido que volta ativo entra de novo; executado não', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [
      { id: '-9000001' },
      { id: '-9000002', situacao: 'removido' },
      { id: '-9000005', situacao: 'executado' },
    ])
    await enviar({
      projetos: [projetoEnvio('EXEMPLO-0001', ['-9000001', '-9000002', '-9000005'])],
      presentes: ['EXEMPLO-0001'],
    })
    const [n] = await novidades()
    expect(n.tipo).toBe('mudou')
    expect(idsDe(n.dados.entram)).toEqual(['-9000002'])
    expect(n.dados.saem).toEqual([])
  })

  it('só alimentadores mudaram: não há novidade', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [{ id: '-9000001' }])
    const resumo = await enviar({
      projetos: [projetoEnvio('EXEMPLO-0001', ['-9000001'], ['EXE02S2', 'EXE01S1'])],
      presentes: ['EXEMPLO-0001'],
    })
    expect(resumo).toMatchObject({ novo: 0, mudou: 0, saiu: 0, corrigido: 0, sem_mudanca: 1 })
    expect(await novidades()).toEqual([])
  })

  it('prioridade nova é a menor dos ativos quando é diferente da carteira', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [{ id: '-9000001' }, { id: '-9000002' }], { prioridade: 7 })
    const p = projetoEnvio('EXEMPLO-0001', [])
    p.defeitos = [defeito('-9000001', 9), defeito('-9000002', 5)]
    await enviar({ projetos: [p], presentes: ['EXEMPLO-0001'] })
    const [n] = await novidades()
    expect(n.dados).toMatchObject({ entram: [], saem: [], prioridade_antes: 7, prioridade_nova: 5 })
  })

  it('saiu: só projeto da Enel da mesma regional que sumiu da aba', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [], { origem: 'manual' })
    await projetoNaCarteira('EXEMPLO-0002', [], { regional: 'CS' })
    await projetoNaCarteira('EXEMPLO-0003', [], { etapa: 'AGUARDANDO VISTORIA' })
    await projetoNaCarteira('EXEMPLO-0004', [], { etapa: 'EXECUTADA' })
    await projetoNaCarteira('EXEMPLO-0005', [])
    await db.query(`update public.projetos set saiu_da_demanda = true where projeto = 'EXEMPLO-0005'`)
    await projetoNaCarteira('EXEMPLO-0006', []) // inativo, mas ainda na aba

    const resumo = await enviar({ projetos: [], presentes: ['EXEMPLO-0006'] })
    expect(resumo).toMatchObject({ novo: 0, mudou: 0, saiu: 1, corrigido: 0 })
    const lista = await novidades()
    expect(lista.map((n) => [n.regional, n.projeto, n.tipo, n.dados])).toEqual([
      ['SUL', 'EXEMPLO-0003', 'saiu', { etapa: 'AGUARDANDO VISTORIA' }],
    ])
  })

  it('saiu aberto vira substituída quando o projeto volta à aba', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [])
    await enviar({ projetos: [], presentes: [] })
    expect((await novidades()).map((n) => [n.tipo, n.situacao])).toEqual([['saiu', 'aberta']])
    await enviar({ projetos: [], presentes: ['EXEMPLO-0001'] })
    expect((await novidades()).map((n) => [n.tipo, n.situacao])).toEqual([['saiu', 'substituida']])
  })

  it('abertas de outra regional não são tocadas', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [], { regional: 'CS' })
    await enviar({ projetos: [], presentes: [] }, 'CS')
    await enviar({ projetos: [], presentes: [] }, 'SUL')
    expect((await novidades()).map((n) => [n.regional, n.tipo, n.situacao])).toEqual([['CS', 'saiu', 'aberta']])
  })

  it('projeto do envio que está na carteira de outra regional fica de fora com aviso', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [{ id: '-9000001' }], { regional: 'CS' })
    const resumo = await enviar({
      projetos: [projetoEnvio('EXEMPLO-0001', ['-9000001', '-9000002'])],
      presentes: ['EXEMPLO-0001'],
    })
    expect(resumo).toMatchObject({ novo: 0, mudou: 0 })
    expect(resumo.avisos).toEqual(['O projeto EXEMPLO-0001 está na carteira do CS e ficou de fora deste envio.'])
    expect(await novidades()).toEqual([])
  })

  it('erro no meio não grava nada', async () => {
    await projetoNaCarteira('EXEMPLO-0009', [])
    await enviar({ projetos: [], presentes: [] })
    // Gatilho só do teste, que quebra na segunda novidade do envio.
    await db.exec(`
      create function public.teste_quebrar() returns trigger language plpgsql as $$
      begin
        if new.projeto = 'EXEMPLO-0002' then raise exception 'EXEMPLO de falha'; end if;
        return new;
      end $$;
      create trigger teste_quebrar before insert on public.novidades
        for each row execute function public.teste_quebrar();
    `)
    await expect(
      enviar({
        projetos: [projetoEnvio('EXEMPLO-0001', ['-9000001']), projetoEnvio('EXEMPLO-0002', ['-9000002'])],
        presentes: ['EXEMPLO-0001', 'EXEMPLO-0002'],
      }),
    ).rejects.toThrow('EXEMPLO de falha')
    expect((await novidades()).map((n) => [n.projeto, n.tipo, n.situacao])).toEqual([
      ['EXEMPLO-0009', 'saiu', 'aberta'],
    ])
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.importacoes')
    expect(rows[0].n).toBe(1)
  })

  it('envio sem a lista de presentes é recusado', async () => {
    await expect(
      como(db, { id: robo }, 'select public.enviar_demanda($1, $2, $3::jsonb)', ['SUL', 'x.xlsx', '{"projetos": []}']),
    ).rejects.toThrow('Envio sem a lista de projetos ou de presentes.')
  })

  it('regional desconhecida é recusada', async () => {
    await expect(enviar({ projetos: [], presentes: [] }, 'NORTE')).rejects.toThrow('Regional desconhecida: NORTE.')
  })

  it('projeto repetido no envio é recusado', async () => {
    await expect(
      enviar({
        projetos: [projetoEnvio('EXEMPLO-0001', ['-9000001']), projetoEnvio('EXEMPLO-0001', ['-9000002'])],
        presentes: ['EXEMPLO-0001'],
      }),
    ).rejects.toThrow('Projeto repetido no envio: EXEMPLO-0001.')
  })

  it('prioridade fora de 1 a 11 é recusada', async () => {
    const p = projetoEnvio('EXEMPLO-0001', [])
    p.defeitos = [defeito('-9000001', 12)]
    await expect(enviar({ projetos: [p], presentes: ['EXEMPLO-0001'] })).rejects.toThrow(
      'Prioridade inválida no defeito -9000001: 12.',
    )
  })

  it('equipe e admin não enviam a demanda', async () => {
    const admin = await criarPessoa(db, { papel: 'admin' })
    for (const id of [equipe, admin]) {
      await expect(
        como(db, { id }, 'select public.enviar_demanda($1, $2, $3::jsonb)', [
          'SUL',
          'x.xlsx',
          '{"projetos": [], "presentes": []}',
        ]),
      ).rejects.toThrow('Só o importador envia a demanda.')
    }
  })

  it('anon não executa as funções do importador', async () => {
    await expect(
      como(db, 'anon', 'select public.enviar_demanda($1, $2, $3::jsonb)', ['SUL', 'x.xlsx', '{}']),
    ).rejects.toThrow('permission denied')
    await expect(
      como(db, 'anon', 'select public.registrar_erro_importacao($1, $2, $3)', ['SUL', 'x.xlsx', 'x']),
    ).rejects.toThrow('permission denied')
  })

  it('registrar_erro_importacao grava o erro visível para a equipe', async () => {
    await como(db, { id: robo }, 'select public.registrar_erro_importacao($1, $2, $3)', [
      'LESTE',
      'x.xlsx',
      'Coluna do projeto não encontrada.',
    ])
    const linhas = await como(db, { id: equipe }, 'select tipo, regional, arquivo, erro from public.importacoes')
    expect(linhas).toEqual([
      { tipo: 'erro', regional: 'LESTE', arquivo: 'x.xlsx', erro: 'Coluna do projeto não encontrada.' },
    ])
  })

  it('só o importador registra erro', async () => {
    await expect(
      como(db, { id: equipe }, 'select public.registrar_erro_importacao($1, $2, $3)', ['LESTE', 'x.xlsx', 'x']),
    ).rejects.toThrow('Só o importador envia a demanda.')
  })

  it('rodar as migrações de novo continua sem erro', async () => {
    await aplicarMigracoes(db)
  })
})
