import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { aplicarMigracoes, como, criarPessoa, novoBanco } from './apoio'

// Tarefa 3: o administrador aceita ou recusa as novidades da Enel.
// Dados só fictícios (projetos EXEMPLO-..., IDs -9000001...).

let modelo: PGlite
let db: PGlite
let admin: string
let equipe: string

beforeAll(async () => {
  modelo = await novoBanco()
}, 60_000)

afterAll(async () => {
  await modelo.close()
})

beforeEach(async () => {
  db = (await modelo.clone()) as PGlite
  admin = await criarPessoa(db, { papel: 'admin' })
  equipe = await criarPessoa(db, { papel: 'equipe' })
  await db.query(
    `insert into public.importacoes (tipo, regional, arquivo) values ('demanda', 'SUL', 'EXEMPLO-demanda.xlsx')`,
  )
})

type Defeito = {
  id_gom: string
  prioridade: number | null
  estrutura: string
  alimentador: string
  estado_enel: string
  lat: number | null
  lng: number | null
}

function defeito(id_gom: string, extra: Partial<Defeito> = {}): Defeito {
  return {
    id_gom,
    prioridade: 7,
    estrutura: 'EXEMPLO-ESTR',
    alimentador: 'EXE01S1',
    estado_enel: 'PENDENTE',
    lat: -7.2,
    lng: -39.4,
    ...extra,
  }
}

function dadosNovo(projeto: string, defeitos: Defeito[], alimentadores = ['EXE01S1']) {
  return { projeto, municipio: 'Exemplópolis', alimentadores, defeitos }
}

let assinaturas = 0

/** Põe uma novidade aberta na fila (direto no banco, como o enviar_demanda faria). */
async function novidade(projeto: string, tipo: string, dados: unknown, regional = 'SUL'): Promise<number> {
  assinaturas += 1
  const { rows } = await db.query<{ id: number }>(
    `insert into public.novidades (importacao_id, regional, projeto, tipo, dados, assinatura)
     values (1, $1, $2, $3, $4::jsonb, $5) returning id`,
    [regional, projeto, tipo, JSON.stringify(dados), `EXEMPLO-assinatura-${assinaturas}`],
  )
  return Number(rows[0].id)
}

async function projetoNaCarteira(
  projeto: string,
  defeitos: { id: string; situacao?: string }[],
  { regional = 'SUL', origem = 'enel', prioridade = 7, etapa = 'PROGRAMAR EXECUÇÃO' } = {},
): Promise<void> {
  await db.query(
    `insert into public.projetos (projeto, regional, origem, prioridade, etapa, alimentadores, municipio,
                                  proxima_acao, responsavel)
     values ($1, $2, $3, $4, $5, '{EXE01S1}', 'Exemplópolis', 'EXEMPLO-acao', $6)`,
    [projeto, regional, origem, prioridade, etapa, equipe],
  )
  for (const d of defeitos) {
    await db.query(
      `insert into public.defeitos (id_gom, projeto, prioridade, situacao) values ($1, $2, 7, $3)`,
      [d.id, projeto, d.situacao ?? 'pendente'],
    )
  }
}

async function aceitar(id: number, escolha: string | null = null, quem = admin): Promise<void> {
  await como(db, { id: quem }, 'select public.aceitar_novidade($1, $2)', [id, escolha])
}

async function aceitarLote(ids: number[], quem = admin): Promise<number> {
  const [linha] = await como<{ n: number }>(db, { id: quem }, 'select public.aceitar_novidades($1::bigint[]) as n', [
    ids,
  ])
  return linha.n
}

async function recusar(id: number, quem = admin): Promise<void> {
  await como(db, { id: quem }, 'select public.recusar_novidade($1)', [id])
}

async function projeto(nome: string) {
  const { rows } = await db.query<Record<string, unknown>>(`select * from public.projetos where projeto = $1`, [nome])
  return rows[0]
}

async function defeitos(nome: string) {
  const { rows } = await db.query<Record<string, unknown>>(
    `select id_gom, prioridade, estrutura, alimentador, estado_enel, situacao, lat, lng
       from public.defeitos where projeto = $1 order by id_gom collate "C"`,
    [nome],
  )
  return rows
}

async function lerNovidade(id: number) {
  const { rows } = await db.query<Record<string, unknown>>(
    `select situacao, escolha, decidida_em, decidida_por from public.novidades where id = $1`,
    [id],
  )
  return rows[0]
}

async function contar(tabela: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.${tabela}`)
  return rows[0].n
}

describe('aceitar_novidade: quem pode e o que já foi decidido', () => {
  it('equipe não aceita: só administrador', async () => {
    const id = await novidade('EXEMPLO-0001', 'novo', dadosNovo('EXEMPLO-0001', [defeito('-9000001')]))
    await expect(aceitar(id, null, equipe)).rejects.toThrow('Só administrador decide as novidades.')
    expect(await projeto('EXEMPLO-0001')).toBeUndefined()
  })

  it('admin desativado não aceita', async () => {
    const inativo = await criarPessoa(db, { papel: 'admin', ativo: false })
    const id = await novidade('EXEMPLO-0001', 'novo', dadosNovo('EXEMPLO-0001', [defeito('-9000001')]))
    await expect(aceitar(id, null, inativo)).rejects.toThrow('Só administrador decide as novidades.')
  })

  it('anon nem executa as funções', async () => {
    const id = await novidade('EXEMPLO-0001', 'novo', dadosNovo('EXEMPLO-0001', [defeito('-9000001')]))
    await expect(como(db, 'anon', 'select public.aceitar_novidade($1)', [id])).rejects.toThrow()
    await expect(como(db, 'anon', 'select public.recusar_novidade($1)', [id])).rejects.toThrow()
    await expect(como(db, 'anon', 'select public.aceitar_novidades($1::bigint[])', [[id]])).rejects.toThrow()
  })

  it('criar_projeto_da_demanda é interna: nem o admin chama direto', async () => {
    await expect(
      como(db, { id: admin }, `select public.criar_projeto_da_demanda('SUL', $1::jsonb)`, [
        JSON.stringify(dadosNovo('EXEMPLO-0001', [defeito('-9000001')])),
      ]),
    ).rejects.toThrow()
    expect(await projeto('EXEMPLO-0001')).toBeUndefined()
  })

  it('novidade já aceita, recusada ou substituída não se decide de novo', async () => {
    const id = await novidade('EXEMPLO-0001', 'novo', dadosNovo('EXEMPLO-0001', [defeito('-9000001')]))
    await aceitar(id)
    await expect(aceitar(id)).rejects.toThrow('Esta novidade já foi decidida.')
    await expect(recusar(id)).rejects.toThrow('Esta novidade já foi decidida.')

    const outra = await novidade('EXEMPLO-0002', 'novo', dadosNovo('EXEMPLO-0002', [defeito('-9000002')]))
    await db.query(`update public.novidades set situacao = 'substituida' where id = $1`, [outra])
    await expect(aceitar(outra)).rejects.toThrow('Esta novidade já foi decidida.')
    expect(await projeto('EXEMPLO-0002')).toBeUndefined()
  })

  it('novidade que não existe dá erro claro', async () => {
    await expect(aceitar(999)).rejects.toThrow('Novidade não encontrada.')
    await expect(recusar(999)).rejects.toThrow('Novidade não encontrada.')
  })
})

describe('aceitar_novidade: novo', () => {
  it('cria o projeto da Enel em EM ANÁLISE com os defeitos pendentes', async () => {
    const id = await novidade(
      'EXEMPLO-0001',
      'novo',
      dadosNovo(
        'EXEMPLO-0001',
        [
          defeito('-9000001', { prioridade: 7, lat: -7.0, lng: -39.0 }),
          defeito('-9000002', { prioridade: 3, lat: -7.4, lng: -39.6, estrutura: 'EXEMPLO-B' }),
          defeito('-9000003', { prioridade: null, lat: null, lng: null }),
        ],
        ['EXE01S1', 'EXE02S2'],
      ),
    )
    await aceitar(id)

    const p = await projeto('EXEMPLO-0001')
    expect(p).toMatchObject({
      regional: 'SUL',
      origem: 'enel',
      etapa: 'EM ANÁLISE',
      prioridade: 3,
      municipio: 'Exemplópolis',
      alimentadores: ['EXE01S1', 'EXE02S2'],
      saiu_da_demanda: false,
    })
    // Média só dos defeitos com coordenada.
    expect(p.lat as number).toBeCloseTo(-7.2, 6)
    expect(p.lng as number).toBeCloseTo(-39.3, 6)

    expect(await defeitos('EXEMPLO-0001')).toEqual([
      {
        id_gom: '-9000001',
        prioridade: 7,
        estrutura: 'EXEMPLO-ESTR',
        alimentador: 'EXE01S1',
        estado_enel: 'PENDENTE',
        situacao: 'pendente',
        lat: -7.0,
        lng: -39.0,
      },
      {
        id_gom: '-9000002',
        prioridade: 3,
        estrutura: 'EXEMPLO-B',
        alimentador: 'EXE01S1',
        estado_enel: 'PENDENTE',
        situacao: 'pendente',
        lat: -7.4,
        lng: -39.6,
      },
      {
        id_gom: '-9000003',
        prioridade: null,
        estrutura: 'EXEMPLO-ESTR',
        alimentador: 'EXE01S1',
        estado_enel: 'PENDENTE',
        situacao: 'pendente',
        lat: null,
        lng: null,
      },
    ])
  })

  it('sem nenhuma coordenada, o projeto fica sem lat e lng', async () => {
    const id = await novidade(
      'EXEMPLO-0001',
      'novo',
      dadosNovo('EXEMPLO-0001', [defeito('-9000001', { lat: null, lng: null })]),
    )
    await aceitar(id)
    expect(await projeto('EXEMPLO-0001')).toMatchObject({ lat: null, lng: null })
  })

  it('marca a novidade como aceita, com quem e quando', async () => {
    const id = await novidade('EXEMPLO-0001', 'novo', dadosNovo('EXEMPLO-0001', [defeito('-9000001')]))
    await aceitar(id)
    const n = await lerNovidade(id)
    expect(n).toMatchObject({ situacao: 'aceita', escolha: null, decidida_por: admin })
    expect(n.decidida_em).not.toBeNull()
  })

  it('o histórico registra o INSERT do projeto com quem = o admin', async () => {
    const id = await novidade('EXEMPLO-0001', 'novo', dadosNovo('EXEMPLO-0001', [defeito('-9000001')]))
    await aceitar(id)
    const { rows } = await db.query<{ tabela: string; operacao: string; quem: string }>(
      `select tabela, operacao, quem from public.historico where chave in ('EXEMPLO-0001', '-9000001') order by id`,
    )
    expect(rows).toEqual([
      { tabela: 'projetos', operacao: 'INSERT', quem: admin },
      { tabela: 'defeitos', operacao: 'INSERT', quem: admin },
    ])
  })

  it('projeto que já está na carteira (criado à mão depois): erro e nada gravado', async () => {
    const id = await novidade('EXEMPLO-0001', 'novo', dadosNovo('EXEMPLO-0001', [defeito('-9000001')]))
    await projetoNaCarteira('EXEMPLO-0001', [], { origem: 'manual' })
    await expect(aceitar(id)).rejects.toThrow(
      'Este projeto já está na carteira. Recuse esta novidade: a próxima importação mostra o que mudou.',
    )
    expect(await defeitos('EXEMPLO-0001')).toEqual([])
    expect((await lerNovidade(id)).situacao).toBe('aberta')
  })

  it('defeito que já está em outro projeto: erro e nada gravado', async () => {
    await projetoNaCarteira('EXEMPLO-0009', [{ id: '-9000002' }])
    const id = await novidade(
      'EXEMPLO-0001',
      'novo',
      dadosNovo('EXEMPLO-0001', [defeito('-9000001'), defeito('-9000002')]),
    )
    await expect(aceitar(id)).rejects.toThrow('O defeito -9000002 já está no projeto EXEMPLO-0009.')
    expect(await projeto('EXEMPLO-0001')).toBeUndefined()
    expect(await contar('defeitos')).toBe(1)
    expect((await lerNovidade(id)).situacao).toBe('aberta')
  })
})

describe('aceitar_novidade: mudou', () => {
  it('entram como pendente, saem os pendentes e programados, muda prioridade e alimentadores', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [
      { id: '-9000001' },
      { id: '-9000002' },
      { id: '-9000003', situacao: 'programado' },
      { id: '-9000004', situacao: 'executado' },
    ])
    const id = await novidade('EXEMPLO-0001', 'mudou', {
      entram: [defeito('-9000005', { prioridade: 2 })],
      saem: ['-9000002', '-9000003', '-9000004'],
      prioridade_antes: 7,
      prioridade_nova: 2,
      alimentadores: ['EXE03S3'],
    })
    await aceitar(id)

    expect((await defeitos('EXEMPLO-0001')).map((d) => [d.id_gom, d.situacao])).toEqual([
      ['-9000001', 'pendente'],
      ['-9000002', 'removido'],
      ['-9000003', 'removido'],
      ['-9000004', 'executado'],
      ['-9000005', 'pendente'],
    ])
    // Não mexe em etapa, próxima ação, responsável nem município.
    expect(await projeto('EXEMPLO-0001')).toMatchObject({
      prioridade: 2,
      alimentadores: ['EXE03S3'],
      etapa: 'PROGRAMAR EXECUÇÃO',
      proxima_acao: 'EXEMPLO-acao',
      responsavel: equipe,
      municipio: 'Exemplópolis',
    })
    expect(await lerNovidade(id)).toMatchObject({ situacao: 'aceita', escolha: null, decidida_por: admin })
  })

  it('prioridade_nova nula: a prioridade do projeto fica como estava', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [{ id: '-9000001' }], { prioridade: 5 })
    const id = await novidade('EXEMPLO-0001', 'mudou', {
      entram: [defeito('-9000002')],
      saem: [],
      prioridade_antes: 5,
      prioridade_nova: null,
      alimentadores: ['EXE01S1'],
    })
    await aceitar(id)
    expect((await projeto('EXEMPLO-0001')).prioridade).toBe(5)
  })

  it('defeito removido no mesmo projeto volta a pendente com os campos novos', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [{ id: '-9000001' }, { id: '-9000002', situacao: 'removido' }])
    const id = await novidade('EXEMPLO-0001', 'mudou', {
      entram: [
        defeito('-9000002', {
          prioridade: 4,
          estrutura: 'EXEMPLO-NOVA',
          alimentador: 'EXE09S9',
          estado_enel: 'EXECUÇÃO',
          lat: -6.5,
          lng: -38.5,
        }),
      ],
      saem: [],
      prioridade_antes: 7,
      prioridade_nova: 4,
      alimentadores: ['EXE01S1', 'EXE09S9'],
    })
    await aceitar(id)
    expect((await defeitos('EXEMPLO-0001'))[1]).toEqual({
      id_gom: '-9000002',
      prioridade: 4,
      estrutura: 'EXEMPLO-NOVA',
      alimentador: 'EXE09S9',
      estado_enel: 'EXECUÇÃO',
      situacao: 'pendente',
      lat: -6.5,
      lng: -38.5,
    })
  })

  it('defeito que entra mas está em outro projeto: erro e nada gravado', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [{ id: '-9000001' }])
    await projetoNaCarteira('EXEMPLO-0009', [{ id: '-9000003', situacao: 'removido' }])
    const id = await novidade('EXEMPLO-0001', 'mudou', {
      entram: [defeito('-9000002'), defeito('-9000003')],
      saem: ['-9000001'],
      prioridade_antes: 7,
      prioridade_nova: 3,
      alimentadores: ['EXE03S3'],
    })
    await expect(aceitar(id)).rejects.toThrow('O defeito -9000003 já está no projeto EXEMPLO-0009.')
    expect((await defeitos('EXEMPLO-0001')).map((d) => [d.id_gom, d.situacao])).toEqual([['-9000001', 'pendente']])
    expect(await projeto('EXEMPLO-0001')).toMatchObject({ prioridade: 7, alimentadores: ['EXE01S1'] })
    expect((await lerNovidade(id)).situacao).toBe('aberta')
  })

  it('projeto que sumiu da carteira: erro claro e nada gravado', async () => {
    const id = await novidade('EXEMPLO-0001', 'mudou', {
      entram: [defeito('-9000002')],
      saem: [],
      prioridade_antes: 7,
      prioridade_nova: null,
      alimentadores: ['EXE01S1'],
    })
    await expect(aceitar(id)).rejects.toThrow(
      'O projeto EXEMPLO-0001 não está mais na carteira. Recuse esta novidade.',
    )
    expect(await contar('defeitos')).toBe(0)
    expect((await lerNovidade(id)).situacao).toBe('aberta')
  })
})

describe('aceitar_novidade: saiu', () => {
  it('MANTER só marca que saiu da demanda', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [{ id: '-9000001' }])
    const id = await novidade('EXEMPLO-0001', 'saiu', { etapa: 'PROGRAMAR EXECUÇÃO' })
    await aceitar(id, 'MANTER')
    expect(await projeto('EXEMPLO-0001')).toMatchObject({ saiu_da_demanda: true, etapa: 'PROGRAMAR EXECUÇÃO' })
    expect(await lerNovidade(id)).toMatchObject({ situacao: 'aceita', escolha: 'MANTER', decidida_por: admin })
  })

  it('TRANSFERIDA e NÃO EXECUTÁVEL marcam e mudam a etapa', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [])
    await projetoNaCarteira('EXEMPLO-0002', [])
    const a = await novidade('EXEMPLO-0001', 'saiu', { etapa: 'PROGRAMAR EXECUÇÃO' })
    const b = await novidade('EXEMPLO-0002', 'saiu', { etapa: 'PROGRAMAR EXECUÇÃO' })
    await aceitar(a, 'TRANSFERIDA')
    await aceitar(b, 'NÃO EXECUTÁVEL')
    expect(await projeto('EXEMPLO-0001')).toMatchObject({ saiu_da_demanda: true, etapa: 'TRANSFERIDA' })
    expect(await projeto('EXEMPLO-0002')).toMatchObject({ saiu_da_demanda: true, etapa: 'NÃO EXECUTÁVEL' })
    expect((await lerNovidade(b)).escolha).toBe('NÃO EXECUTÁVEL')
  })

  it('sem escolha ou com escolha que não vale: erro e nada gravado', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [])
    const id = await novidade('EXEMPLO-0001', 'saiu', { etapa: 'PROGRAMAR EXECUÇÃO' })
    await expect(aceitar(id)).rejects.toThrow('Escolha o que fazer com este projeto.')
    await expect(aceitar(id, 'EXECUTADO')).rejects.toThrow('Escolha o que fazer com este projeto.')
    await expect(aceitar(id, 'EXEMPLO')).rejects.toThrow('Escolha o que fazer com este projeto.')
    expect(await projeto('EXEMPLO-0001')).toMatchObject({ saiu_da_demanda: false })
    expect((await lerNovidade(id)).situacao).toBe('aberta')
  })

  it('projeto que sumiu da carteira: erro claro', async () => {
    const id = await novidade('EXEMPLO-0001', 'saiu', { etapa: 'PROGRAMAR EXECUÇÃO' })
    await expect(aceitar(id, 'MANTER')).rejects.toThrow(
      'O projeto EXEMPLO-0001 não está mais na carteira. Recuse esta novidade.',
    )
    expect((await lerNovidade(id)).situacao).toBe('aberta')
  })
})

describe('aceitar_novidade: corrigido', () => {
  async function preparar(): Promise<number> {
    await projetoNaCarteira('EXEMPLO-0001', [
      { id: '-9000001' },
      { id: '-9000002', situacao: 'programado' },
      { id: '-9000003' },
    ])
    return novidade('EXEMPLO-0001', 'corrigido', {
      defeitos: [
        { id_gom: '-9000001', estado_enel: 'CORRIGIDO EMERGENCIAL' },
        { id_gom: '-9000002', estado_enel: 'EXECUTADA' },
      ],
    })
  }

  it('EXECUTADO: os defeitos viram executado', async () => {
    const id = await preparar()
    await aceitar(id, 'EXECUTADO')
    expect((await defeitos('EXEMPLO-0001')).map((d) => [d.id_gom, d.situacao, d.estado_enel])).toEqual([
      ['-9000001', 'executado', 'CORRIGIDO EMERGENCIAL'],
      ['-9000002', 'executado', 'EXECUTADA'],
      ['-9000003', 'pendente', null],
    ])
    expect(await lerNovidade(id)).toMatchObject({ situacao: 'aceita', escolha: 'EXECUTADO', decidida_por: admin })
  })

  it('TIRAR: os defeitos viram removido', async () => {
    const id = await preparar()
    await aceitar(id, 'TIRAR')
    expect((await defeitos('EXEMPLO-0001')).map((d) => [d.id_gom, d.situacao])).toEqual([
      ['-9000001', 'removido'],
      ['-9000002', 'removido'],
      ['-9000003', 'pendente'],
    ])
  })

  it('sem escolha ou com escolha que não vale: erro e nada gravado', async () => {
    const id = await preparar()
    await expect(aceitar(id)).rejects.toThrow('Escolha o que fazer com este projeto.')
    await expect(aceitar(id, 'MANTER')).rejects.toThrow('Escolha o que fazer com este projeto.')
    expect((await defeitos('EXEMPLO-0001')).map((d) => d.situacao)).toEqual(['pendente', 'programado', 'pendente'])
    expect((await lerNovidade(id)).situacao).toBe('aberta')
  })

  it('projeto que sumiu da carteira: erro claro', async () => {
    const id = await novidade('EXEMPLO-0001', 'corrigido', {
      defeitos: [{ id_gom: '-9000001', estado_enel: 'EXECUTADA' }],
    })
    await expect(aceitar(id, 'EXECUTADO')).rejects.toThrow(
      'O projeto EXEMPLO-0001 não está mais na carteira. Recuse esta novidade.',
    )
  })
})

describe('aceitar_novidades: lote', () => {
  it('3 novos: cria os 3 e devolve 3', async () => {
    const ids = [
      await novidade('EXEMPLO-0001', 'novo', dadosNovo('EXEMPLO-0001', [defeito('-9000001')])),
      await novidade('EXEMPLO-0002', 'novo', dadosNovo('EXEMPLO-0002', [defeito('-9000002')])),
      await novidade('EXEMPLO-0003', 'novo', dadosNovo('EXEMPLO-0003', [defeito('-9000003')])),
    ]
    expect(await aceitarLote(ids)).toBe(3)
    expect(await contar('projetos')).toBe(3)
    for (const id of ids) expect(await lerNovidade(id)).toMatchObject({ situacao: 'aceita', decidida_por: admin })
  })

  it('se o 2º falha (defeito em outro projeto), nenhum dos 3 é criado', async () => {
    await projetoNaCarteira('EXEMPLO-0009', [{ id: '-9000002' }])
    const ids = [
      await novidade('EXEMPLO-0001', 'novo', dadosNovo('EXEMPLO-0001', [defeito('-9000001')])),
      await novidade('EXEMPLO-0002', 'novo', dadosNovo('EXEMPLO-0002', [defeito('-9000002')])),
      await novidade('EXEMPLO-0003', 'novo', dadosNovo('EXEMPLO-0003', [defeito('-9000003')])),
    ]
    await expect(aceitarLote(ids)).rejects.toThrow('O defeito -9000002 já está no projeto EXEMPLO-0009.')
    expect(await contar('projetos')).toBe(1)
    for (const id of ids) expect((await lerNovidade(id)).situacao).toBe('aberta')
  })

  it('novos e mudanças juntos', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [{ id: '-9000001' }])
    const ids = [
      await novidade('EXEMPLO-0001', 'mudou', {
        entram: [defeito('-9000002')],
        saem: ['-9000001'],
        prioridade_antes: 7,
        prioridade_nova: null,
        alimentadores: ['EXE01S1'],
      }),
      await novidade('EXEMPLO-0002', 'novo', dadosNovo('EXEMPLO-0002', [defeito('-9000003')])),
    ]
    expect(await aceitarLote(ids)).toBe(2)
    expect((await defeitos('EXEMPLO-0001')).map((d) => [d.id_gom, d.situacao])).toEqual([
      ['-9000001', 'removido'],
      ['-9000002', 'pendente'],
    ])
    expect(await projeto('EXEMPLO-0002')).toBeDefined()
  })

  it('lote com saiu ou corrigido: erro e nada aplicado', async () => {
    await projetoNaCarteira('EXEMPLO-0005', [{ id: '-9000005' }])
    const novo = await novidade('EXEMPLO-0001', 'novo', dadosNovo('EXEMPLO-0001', [defeito('-9000001')]))
    const saiu = await novidade('EXEMPLO-0005', 'saiu', { etapa: 'PROGRAMAR EXECUÇÃO' })
    const corrigido = await novidade('EXEMPLO-0005', 'corrigido', {
      defeitos: [{ id_gom: '-9000005', estado_enel: 'EXECUTADA' }],
    })
    const mensagem = 'Em lote, só projetos novos e mudanças. Decida os outros um a um.'
    await expect(aceitarLote([novo, saiu])).rejects.toThrow(mensagem)
    await expect(aceitarLote([novo, corrigido])).rejects.toThrow(mensagem)
    expect(await projeto('EXEMPLO-0001')).toBeUndefined()
    expect((await lerNovidade(novo)).situacao).toBe('aberta')
  })

  it('equipe não aceita em lote', async () => {
    const id = await novidade('EXEMPLO-0001', 'novo', dadosNovo('EXEMPLO-0001', [defeito('-9000001')]))
    await expect(aceitarLote([id], equipe)).rejects.toThrow('Só administrador decide as novidades.')
  })

  it('lote vazio devolve 0', async () => {
    expect(await aceitarLote([])).toBe(0)
  })

  it('lote com uma já decidida: erro e nada aplicado', async () => {
    const a = await novidade('EXEMPLO-0001', 'novo', dadosNovo('EXEMPLO-0001', [defeito('-9000001')]))
    const b = await novidade('EXEMPLO-0002', 'novo', dadosNovo('EXEMPLO-0002', [defeito('-9000002')]))
    await recusar(b)
    await expect(aceitarLote([a, b])).rejects.toThrow('Esta novidade já foi decidida.')
    expect(await projeto('EXEMPLO-0001')).toBeUndefined()
  })
})

describe('recusar_novidade', () => {
  it('marca recusada com quem e quando, sem mexer na carteira', async () => {
    await projetoNaCarteira('EXEMPLO-0001', [{ id: '-9000001' }])
    const id = await novidade('EXEMPLO-0001', 'mudou', {
      entram: [],
      saem: ['-9000001'],
      prioridade_antes: 7,
      prioridade_nova: null,
      alimentadores: ['EXE01S1'],
    })
    await recusar(id)
    const n = await lerNovidade(id)
    expect(n).toMatchObject({ situacao: 'recusada', escolha: null, decidida_por: admin })
    expect(n.decidida_em).not.toBeNull()
    expect((await defeitos('EXEMPLO-0001'))[0].situacao).toBe('pendente')
  })

  it('equipe chamando recusar_novidade: só administrador', async () => {
    const id = await novidade('EXEMPLO-0001', 'novo', dadosNovo('EXEMPLO-0001', [defeito('-9000001')]))
    await expect(recusar(id, equipe)).rejects.toThrow('Só administrador decide as novidades.')
    expect((await lerNovidade(id)).situacao).toBe('aberta')
  })
})

describe('do envio ao aceite', () => {
  it('a novidade criada pelo enviar_demanda é aceita do jeito que veio', async () => {
    const robo = await criarPessoa(db, { papel: 'importador' })
    await como(db, { id: robo }, 'select public.enviar_demanda($1, $2, $3::jsonb)', [
      'SUL',
      'EXEMPLO-demanda.xlsx',
      JSON.stringify({
        projetos: [dadosNovo('EXEMPLO-0001', [defeito('-9000002', { prioridade: 4 }), defeito('-9000001')])],
        presentes: ['EXEMPLO-0001'],
      }),
    ])
    const [n] = await como<{ id: number }>(db, { id: admin }, `select id from public.novidades where tipo = 'novo'`)
    await aceitar(Number(n.id))
    expect(await projeto('EXEMPLO-0001')).toMatchObject({ origem: 'enel', prioridade: 4, etapa: 'EM ANÁLISE' })
    expect((await defeitos('EXEMPLO-0001')).map((d) => d.id_gom)).toEqual(['-9000001', '-9000002'])

    // Na próxima foto entra um defeito: mudou, aceito.
    await como(db, { id: robo }, 'select public.enviar_demanda($1, $2, $3::jsonb)', [
      'SUL',
      'EXEMPLO-demanda.xlsx',
      JSON.stringify({
        projetos: [
          dadosNovo('EXEMPLO-0001', [defeito('-9000001'), defeito('-9000003', { prioridade: 2 })], ['EXE05S5']),
        ],
        presentes: ['EXEMPLO-0001'],
      }),
    ])
    const [m] = await como<{ id: number }>(
      db,
      { id: admin },
      `select id from public.novidades where tipo = 'mudou' and situacao = 'aberta'`,
    )
    await aceitar(Number(m.id))
    expect((await defeitos('EXEMPLO-0001')).map((d) => [d.id_gom, d.situacao])).toEqual([
      ['-9000001', 'pendente'],
      ['-9000002', 'removido'],
      ['-9000003', 'pendente'],
    ])
    expect(await projeto('EXEMPLO-0001')).toMatchObject({ prioridade: 2, alimentadores: ['EXE05S5'] })
  })
})

describe('002 com as funções de decidir', () => {
  it('rodar as migrações de novo não dá erro', async () => {
    await aplicarMigracoes(db)
    await aplicarMigracoes(db)
  })
})
