import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { aplicarMigracoes, como, criarPessoa, novoBanco } from './apoio'

// Tarefa 7: carga inicial da carteira (xlsm + demanda), uma vez só.
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
})

function defeito(id_gom: string, extra: Record<string, unknown> = {}) {
  return {
    id_gom,
    prioridade: 7,
    estrutura: 'EXEMPLO-EST',
    alimentador: 'EXE01S1',
    estado_enel: 'PENDENTE',
    lat: -7.2,
    lng: -39.4,
    ...extra,
  }
}

function projetoXlsm(projeto: string, extra: Record<string, unknown> = {}) {
  return {
    projeto,
    regional: 'SUL',
    origem: 'manual',
    ot_correcao: null,
    municipio: 'Exemplópolis',
    endereco: 'EXEMPLO, campo 1',
    prioridade: 8,
    alimentadores: [],
    elemento_corte: 'EXEMPLO-CHAVE',
    qtd_clientes: 10,
    estruturas: ['EXEMPLO-EST-1'],
    intervencao_prevista: 'DESL MT',
    etapa: 'AGUARDANDO VISTORIA',
    proxima_acao: 'AGUARDAR VISTORIA',
    prazo_proxima_acao: '2026-10-10',
    vistoria_data: '2026-09-05',
    vistoria_situacao: 'SEM VISTORIA',
    vistoria_recurso: 'EXEMPLO-RECURSO',
    vistoria_intervencao: 'DESL MT',
    vistoria_observacao: 'EXEMPLO-OBS',
    vistoria_enviada_em: '2026-09-01',
    responsavel: null,
    qtd_defeitos_informada: null,
    defeitos: [],
    ...extra,
  }
}

function cargaBasica() {
  return {
    arquivo: 'EXEMPLO-controle.xlsm',
    projetos: [
      projetoXlsm('EXEMPLO-C001', {
        origem: 'enel',
        etapa: 'PROGRAMADA',
        prioridade: 5,
        alimentadores: ['EXE01S1'],
        defeitos: [defeito('-9000001', { prioridade: 5 }), defeito('-9000002', { estado_enel: null, lat: null, lng: null })],
      }),
      projetoXlsm('EXEMPLO-C002', { origem: 'manual', etapa: 'AGUARDANDO VISTORIA', qtd_defeitos_informada: 4 }),
    ],
    da_demanda: [
      {
        regional: 'SUL',
        projeto: 'EXEMPLO-C003',
        municipio: 'Exemplópolis',
        alimentadores: ['EXE01S1'],
        defeitos: [defeito('-9000003', { prioridade: 2 })],
      },
    ],
    equipes: [
      { lid: 'JZN-ML-99X', chefe: 'Pessoa Exemplo', tipo: 'ML', regional: 'SUL', base: 'JZN', grupo_report: 'ML Juazeiro' },
    ],
    solicitantes: ['Solicitante Exemplo'],
    avisos: ['EXEMPLO: aviso do importador.'],
  }
}

async function carregar(carga: unknown = cargaBasica(), apagar = false, quem = admin) {
  const [linha] = await como<{ r: Record<string, unknown> }>(
    db,
    { id: quem },
    'select public.carga_inicial($1::jsonb, $2) as r',
    [JSON.stringify(carga), apagar],
  )
  return linha.r
}

async function projetos() {
  const { rows } = await db.query<Record<string, unknown>>(
    `select projeto, regional, origem, etapa, prioridade, municipio, qtd_defeitos_informada, responsavel,
            vistoria_data::text as vistoria_data, prazo_proxima_acao::text as prazo, lat, lng
       from public.projetos order by projeto`,
  )
  return rows
}

async function defeitos() {
  const { rows } = await db.query<Record<string, unknown>>(
    `select id_gom, projeto, situacao, prioridade, estado_enel, lat from public.defeitos order by id_gom collate "C"`,
  )
  return rows
}

function hojeEmFortaleza(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Fortaleza',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date())
}

describe('carga_inicial', () => {
  it('cria o projeto do xlsm na demanda, o manual e o só da demanda com origens e etapas certas', async () => {
    const r = await carregar()
    const ps = await projetos()
    expect(ps.map((p) => [p.projeto, p.origem, p.etapa, p.prioridade])).toEqual([
      ['EXEMPLO-C001', 'enel', 'PROGRAMADA', 5],
      ['EXEMPLO-C002', 'manual', 'AGUARDANDO VISTORIA', 8],
      ['EXEMPLO-C003', 'enel', 'EM ANÁLISE', 2],
    ])
    expect(ps[0]).toMatchObject({ vistoria_data: '2026-09-05', prazo: '2026-10-10', lat: -7.2, lng: -39.4 })
    expect(ps[1].qtd_defeitos_informada).toBe(4)
    expect(ps[2].municipio).toBe('Exemplópolis')
    expect(await defeitos()).toEqual([
      { id_gom: '-9000001', projeto: 'EXEMPLO-C001', situacao: 'pendente', prioridade: 5, estado_enel: 'PENDENTE', lat: -7.2 },
      { id_gom: '-9000002', projeto: 'EXEMPLO-C001', situacao: 'pendente', prioridade: 7, estado_enel: null, lat: null },
      { id_gom: '-9000003', projeto: 'EXEMPLO-C003', situacao: 'pendente', prioridade: 2, estado_enel: 'PENDENTE', lat: -7.2 },
    ])
    expect(r).toMatchObject({
      projetos_enel: 1,
      projetos_manuais: 1,
      projetos_da_demanda: 1,
      defeitos: 3,
      equipes: 1,
      solicitantes: 1,
      exemplos_apagados: 0,
      avisos: ['EXEMPLO: aviso do importador.'],
    })
    const { rows } = await db.query<{ tipo: string; regional: string | null; arquivo: string; resumo: unknown }>(
      `select tipo, regional, arquivo, resumo from public.importacoes`,
    )
    expect(rows).toEqual([{ tipo: 'carga', regional: null, arquivo: 'EXEMPLO-controle.xlsm', resumo: r }])
  })

  it('o histórico registra o administrador como quem criou', async () => {
    await carregar()
    const { rows } = await db.query<{ quem: string }>(
      `select distinct quem from public.historico where tabela = 'projetos'`,
    )
    expect(rows).toEqual([{ quem: admin }])
  })

  it('segunda chamada recusa com a data da primeira', async () => {
    await carregar()
    await expect(carregar()).rejects.toThrow(`A carga inicial já foi feita em ${hojeEmFortaleza()}.`)
  })

  it('só administrador faz a carga', async () => {
    await expect(carregar(cargaBasica(), false, equipe)).rejects.toThrow('Só administrador faz a carga inicial.')
    const inativo = await criarPessoa(db, { papel: 'admin', ativo: false })
    await expect(carregar(cargaBasica(), false, inativo)).rejects.toThrow('Só administrador faz a carga inicial.')
    await expect(
      como(db, 'anon', 'select public.carga_inicial($1::jsonb, false)', [JSON.stringify(cargaBasica())]),
    ).rejects.toThrow()
    expect(await projetos()).toEqual([])
  })

  it('carga sem as listas é recusada sem gravar nada', async () => {
    await expect(carregar({ projetos: [] })).rejects.toThrow(
      'Carga sem as listas de projetos, projetos da demanda, equipes e solicitantes.',
    )
    const { rows } = await db.query(`select 1 from public.importacoes`)
    expect(rows).toEqual([])
  })

  it('p_apagar_exemplos apaga EXEMPLO-0001, os defeitos e as novidades dele', async () => {
    await db.query(`insert into public.projetos (projeto, regional) values ('EXEMPLO-0001', 'CS')`)
    await db.query(`insert into public.defeitos (id_gom, projeto) values ('EXEMPLO-D0001-1', 'EXEMPLO-0001')`)
    await db.query(
      `insert into public.importacoes (tipo, regional, arquivo) values ('demanda', 'CS', 'EXEMPLO-demanda.xlsx')`,
    )
    await db.query(
      `insert into public.novidades (importacao_id, regional, projeto, tipo, dados, assinatura)
       values (1, 'CS', 'EXEMPLO-0001', 'saiu', '{}', 'EXEMPLO-assinatura')`,
    )
    const r = await carregar(cargaBasica(), true)
    expect(r.exemplos_apagados).toBe(1)
    expect((await projetos()).map((p) => p.projeto)).toEqual(['EXEMPLO-C001', 'EXEMPLO-C002', 'EXEMPLO-C003'])
    expect((await defeitos()).map((d) => d.id_gom)).not.toContain('EXEMPLO-D0001-1')
    expect((await db.query(`select 1 from public.novidades`)).rows).toEqual([])
  })

  it('sem p_apagar_exemplos o exemplo fica', async () => {
    await db.query(`insert into public.projetos (projeto, regional) values ('EXEMPLO-0001', 'CS')`)
    await carregar(cargaBasica(), false)
    expect((await projetos()).map((p) => p.projeto)).toContain('EXEMPLO-0001')
  })

  it('responsável liga ao perfil cujo nome começa com o texto, sem acento e caixa', async () => {
    await db.query(`update public.perfis set nome = 'Ítalo Exemplo' where id = $1`, [admin])
    const carga = cargaBasica()
    carga.projetos[0] = { ...carga.projetos[0], responsavel: 'italo' }
    carga.projetos[1] = { ...carga.projetos[1], responsavel: 'Ninguém Exemplo' }
    const r = await carregar(carga)
    const ps = await projetos()
    expect(ps[0].responsavel).toBe(admin)
    expect(ps[1].responsavel).toBeNull()
    expect(r.avisos).toContain('Responsável "Ninguém Exemplo" sem perfil no PMRD: 1 projeto ficou sem responsável.')
  })

  it('responsável que combina com mais de um perfil fica vazio com aviso', async () => {
    await db.query(`update public.perfis set nome = 'Pessoa Exemplo Um' where id = $1`, [admin])
    await db.query(`update public.perfis set nome = 'Pessoa Exemplo Dois' where id = $1`, [equipe])
    const carga = cargaBasica()
    carga.projetos[0] = { ...carga.projetos[0], responsavel: 'pessoa exemplo' }
    const r = await carregar(carga)
    expect((await projetos())[0].responsavel).toBeNull()
    expect(r.avisos).toContain(
      'Responsável "pessoa exemplo" combina com mais de um perfil: 1 projeto ficou sem responsável.',
    )
  })

  it('projeto que já existe e defeito que já está em outro projeto viram aviso', async () => {
    await db.query(`insert into public.projetos (projeto, regional) values ('EXEMPLO-C002', 'SUL')`)
    await db.query(`insert into public.projetos (projeto, regional) values ('EXEMPLO-OUTRO', 'SUL')`)
    await db.query(`insert into public.defeitos (id_gom, projeto) values ('-9000002', 'EXEMPLO-OUTRO')`)
    await db.query(`insert into public.defeitos (id_gom, projeto) values ('-9000003', 'EXEMPLO-OUTRO')`)
    const r = await carregar()
    expect(r.avisos).toEqual([
      'EXEMPLO: aviso do importador.',
      'O defeito -9000002 já está no projeto EXEMPLO-OUTRO e ficou de fora do projeto EXEMPLO-C001.',
      'O projeto EXEMPLO-C002 já está na carteira e ficou de fora da carga.',
      'O defeito -9000003 já está no projeto EXEMPLO-OUTRO e ficou de fora do projeto EXEMPLO-C003.',
    ])
    expect(r).toMatchObject({ projetos_enel: 1, projetos_manuais: 0, projetos_da_demanda: 1, defeitos: 1 })
    expect((await defeitos()).filter((d) => d.projeto !== 'EXEMPLO-OUTRO').map((d) => d.id_gom)).toEqual(['-9000001'])
  })

  it('equipe que já existe fica como está; solicitante com o mesmo nome não se repete', async () => {
    await db.query(
      `insert into public.equipes (lid, chefe, tipo, regional) values ('JZN-ML-99X', 'Pessoa Antiga', 'ML', 'SUL')`,
    )
    await db.query(`insert into public.solicitantes_sgd (nome) values ('solicitante exemplo')`)
    const carga = cargaBasica()
    carga.equipes.push({
      lid: 'CPS-LV-99X',
      chefe: 'Pessoa Exemplo',
      tipo: 'LVR',
      regional: 'SUL',
      base: 'CPS',
      grupo_report: 'Linha Viva',
    })
    carga.solicitantes.push('Solicitante Exemplo Novo')
    const r = await carregar(carga)
    expect(r).toMatchObject({ equipes: 1, solicitantes: 1 })
    expect(r.avisos).toContain('A equipe JZN-ML-99X já estava cadastrada e ficou como está.')
    const { rows: eqs } = await db.query(`select lid, chefe, regional, base, grupo_report from public.equipes order by lid`)
    expect(eqs).toEqual([
      { lid: 'CPS-LV-99X', chefe: 'Pessoa Exemplo', regional: 'SUL', base: 'CPS', grupo_report: 'Linha Viva' },
      { lid: 'JZN-ML-99X', chefe: 'Pessoa Antiga', regional: 'SUL', base: null, grupo_report: null },
    ])
    const { rows: sols } = await db.query(`select nome from public.solicitantes_sgd order by lower(nome)`)
    expect(sols).toEqual([{ nome: 'solicitante exemplo' }, { nome: 'Solicitante Exemplo Novo' }])
  })

  it('equipes dos 10 tipos novos entram pela carga, sem grupo do Report (Tarefa 7c)', async () => {
    const novos = ['RD', 'LB', 'LN', 'MM', 'SK', 'GA', 'TR', 'RL', 'LM', 'MO']
    const carga = cargaBasica()
    carga.equipes = novos.map((tipo, i) => ({
      lid: `JZN-${tipo}-${String(90 + i)}X`, chefe: 'Pessoa Exemplo', tipo, regional: 'SUL', base: 'JZN', grupo_report: '',
    }))
    const r = await carregar(carga)
    expect(r).toMatchObject({ equipes: 10 })
    const { rows } = await db.query<{ tipo: string; grupo_report: string | null }>(
      `select tipo, grupo_report from public.equipes order by lid`,
    )
    expect(rows.map((e) => e.tipo).sort()).toEqual([...novos].sort())
    expect(rows.every((e) => e.grupo_report === null)).toBe(true)
  })

  it('tipo fora da lista continua recusado e nada é gravado', async () => {
    const carga = cargaBasica()
    carga.equipes = [{ lid: 'JZN-XX-99X', chefe: 'Pessoa Exemplo', tipo: 'XX', regional: 'SUL', base: 'JZN', grupo_report: '' }]
    await expect(carregar(carga)).rejects.toThrow()
    expect((await db.query(`select 1 from public.equipes`)).rows).toEqual([])
    expect(await projetos()).toEqual([])
  })

  it('rodar as migrações de novo mantém os tipos novos aceitos', async () => {
    await aplicarMigracoes(db)
    await aplicarMigracoes(db)
    const carga = cargaBasica()
    carga.equipes = [{ lid: 'RSL-RD-99X', chefe: 'Pessoa Exemplo', tipo: 'RD', regional: 'LESTE', base: 'RSL', grupo_report: '' }]
    expect(await carregar(carga)).toMatchObject({ equipes: 1 })
    await expect(db.query(
      `insert into public.equipes (lid, chefe, tipo, regional) values ('JZN-XX-98X', 'Pessoa Exemplo', 'XX', 'SUL')`,
    )).rejects.toThrow()
  })

  it('erro no meio desfaz tudo', async () => {
    const carga = cargaBasica()
    carga.projetos[1] = { ...carga.projetos[1], regional: 'NORTE' }
    await expect(carregar(carga)).rejects.toThrow()
    expect(await projetos()).toEqual([])
    expect((await db.query(`select 1 from public.importacoes`)).rows).toEqual([])
  })
})
