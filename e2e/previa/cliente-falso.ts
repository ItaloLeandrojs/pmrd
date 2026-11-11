// Cliente falso em memória (prévia). Imita o encadeamento do supabase-js usado pelo site.
// Sem rede. ?previa=dentro na URL entra logado como conta admin fictícia.

const HOJE = '2026-11-10'
const DIA = 86_400_000
const dia = (n: number) => new Date(Date.parse(HOJE + 'T12:00:00Z') + n * DIA).toISOString().slice(0, 10)
const ts = (n: number, h = 14) => new Date(Date.parse(HOJE + `T${String(h).padStart(2, '0')}:00:00Z`) + n * DIA).toISOString()

const USUARIO = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'previa@exemplo.test',
  nome: 'Pessoa Exemplo',
  papel: 'admin',
  ativo: true,
  senha_provisoria: false,
  regional_preferida: 'CS',
  tema: 'sistema',
}

const ETAPAS = [
  'EM ANÁLISE', 'SOLICITAR VISTORIA', 'AGUARDANDO VISTORIA', 'ANÁLISE PÓS-VISTORIA', 'PROGRAMAR EXECUÇÃO',
  'SOLICITAR SGD', 'AGUARDANDO SGD', 'PROGRAMADA', 'PENDENTE DE RETORNO', 'EXECUTADA', 'TRANSFERIDA', 'NÃO EXECUTÁVEL',
]
const MUNICIPIOS = ['Icó', 'Juazeiro do Norte', 'Iguatu', 'Crato', 'Barbalha', 'Quixadá', 'Russas', 'Limoeiro do Norte', 'Sobral', 'Maracanaú']
const REGIONAIS = ['CS', 'CS', 'SUL', 'CS', 'SUL', 'CS', 'LESTE', 'LESTE', 'CS', 'LESTE']
const PESSOAS = [
  { id: USUARIO.id, nome: 'Pessoa Exemplo', ativo: true },
  { id: '00000000-0000-4000-8000-000000000002', nome: 'Ana Exemplo', ativo: true },
  { id: '00000000-0000-4000-8000-000000000003', nome: 'Bruno Exemplo', ativo: true },
  { id: '00000000-0000-4000-8000-000000000004', nome: 'Carla Exemplo', ativo: true },
  { id: '00000000-0000-4000-8000-000000000005', nome: 'Diego Exemplo', ativo: true },
  // Conta criada pelo painel do Supabase: nome vazio, a tela mostra o e-mail (caso A2).
  { id: '00000000-0000-4000-8000-000000000006', nome: '', ativo: true },
]
// Responsável guarda o id da pessoa (como no banco), não o nome.
const RESP = [PESSOAS[1].id, PESSOAS[2].id, PESSOAS[3].id, PESSOAS[5].id, null]
const ACOES = [
  'Conferir fotos do defeito', 'Pedir vistoria ao campo', 'Cobrar retorno da vistoria', 'Analisar laudo da vistoria',
  'Montar programação', 'Abrir SGD', 'Acompanhar aprovação do SGD', 'Confirmar equipe no dia', 'Cobrar retorno da equipe',
]

const projetos: any[] = []
for (let i = 0; i < 25; i++) {
  const concl = i % 12 >= 9
  // vistoria: sem / válida / vencendo / vencida
  const vtipo = i % 4
  const vistoria = vtipo === 0 ? null : vtipo === 1 ? dia(-(5 + i)) : vtipo === 2 ? dia(-(39 + (i % 5))) : dia(-(50 + i))
  projetos.push({
    projeto: `EXEMPLO-${String(i + 1).padStart(4, '0')}`,
    regional: REGIONAIS[i % 10],
    origem: i % 8 === 7 ? 'manual' : 'enel',
    municipio: MUNICIPIOS[i % 10],
    prioridade: (i % 11) + 1,
    pedido_gestor: i % 6 === 2,
    pedido_gestor_em: i % 6 === 2 ? dia(-(i % 9)) : null,
    pedido_gestor_por: i % 6 === 2 ? 'Gestor Exemplo' : null,
    alimentadores: [`ALIM-${100 + i}`, ...(i % 3 === 0 ? [`ALIM-${200 + i}`] : [])],
    etapa: ETAPAS[i % 12],
    etapa_desde: ts(-((i * 3) % 24) - 1),
    proxima_acao: concl ? null : ACOES[i % ACOES.length],
    prazo_proxima_acao: concl || i % 5 === 0 ? null : dia(((i * 7) % 21) - 8),
    vistoria_data: vistoria,
    responsavel: RESP[i % 5],
    atualizado_em: ts(-(i % 6), 10).replace('Z', '.123456+00:00'),
    qtd_defeitos_informada: (i % 4) + 1,
    defeitos: null,
    ot_correcao: i % 3 === 0 ? `OT-${9000 + i}` : null,
    endereco: `Rua Exemplo, ${100 + i}`,
    elemento_corte: i % 2 ? 'CH-' + (300 + i) : null,
    qtd_clientes: 40 + i * 13,
    estruturas: [`ESTR-${i + 1}A`, `ESTR-${i + 1}B`],
    intervencao_prevista: i % 2 ? 'Troca de cruzeta e isoladores' : 'Substituição de poste',
    vistoria_situacao: vistoria ? 'Realizada' : null,
    vistoria_recurso: vistoria ? 'Cesto aéreo' : null,
    vistoria_intervencao: vistoria ? 'Troca de cruzeta' : null,
    vistoria_observacao: vistoria ? 'Acesso pela lateral do terreno.' : null,
    vistoria_enviada_em: vistoria,
    saiu_da_demanda: false,
  })
}
projetos[0].defeitos = [{ situacao: 'pendente' }, { situacao: 'programado' }, { situacao: 'executado' }]
projetos[0].etapa = 'AGUARDANDO VISTORIA'
projetos[0].regional = 'CS'

const defeitos = [
  { id_gom: 'EXEMPLO-D0001', projeto: 'EXEMPLO-0001', prioridade: 3, estrutura: 'ESTR-1A', alimentador: 'ALIM-100', situacao: 'pendente' },
  { id_gom: 'EXEMPLO-D0002', projeto: 'EXEMPLO-0001', prioridade: 5, estrutura: 'ESTR-1B', alimentador: 'ALIM-100', situacao: 'programado' },
  { id_gom: 'EXEMPLO-D0003', projeto: 'EXEMPLO-0001', prioridade: 8, estrutura: 'ESTR-1B', alimentador: 'ALIM-200', situacao: 'executado' },
]
const historico = [
  {
    tabela: 'projetos', chave: 'EXEMPLO-0001', quando: ts(-2, 15), quem: USUARIO.id,
    antes: { etapa: 'SOLICITAR VISTORIA' }, depois: { etapa: 'AGUARDANDO VISTORIA' },
  },
  {
    tabela: 'projetos', chave: 'EXEMPLO-0001', quando: ts(-6, 9), quem: PESSOAS[1].id,
    antes: { responsavel: null }, depois: { responsavel: 'Ana Exemplo' },
  },
]
const parametros = [{
  id: 1, validade_vistoria: 45, prazo_reenvio_vistoria: 15, alerta_vencimento: 7, alerta_prazo: 3,
  parado_amarelo: 7, parado_vermelho: 15, raio_mapa_km: 10,
}]
const equipes = [
  { lid: 'LID-001', chefe: 'Chefe Exemplo', tipo: 'LV', regional: 'CS', grupo_report: null, base: 'Base Exemplo', ativa: true, foto_path: null },
]
const motivos = [{ id: 'm1', nome: 'SOLO ENCHARCADO', ativo: true, ordem: 8 }]
const solicitantes = [{ id: 's1', nome: 'Solicitante Exemplo', email: null, ativo: true }]

const perfis = [
  { ...USUARIO },
  ...PESSOAS.slice(1).map((p, i) => ({ ...p, email: `pessoa${i + 2}@exemplo.test`, papel: 'equipe', senha_provisoria: false, regional_preferida: 'TODAS', tema: 'sistema' })),
]

// Novidades da Enel (plano 2): uma leitura por regional (CS lida há pouco, Sul com erro, Leste há mais de
// 26 horas) e a fila aberta do CS, com um exemplo de cada tipo. Horas relativas ao relógio do navegador.
const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const importacoes = [
  {
    id: 1, tipo: 'demanda', regional: 'CS', arquivo: '00_EXEMPLO.xlsx', quando: horasAtras(2), erro: null,
    resumo: {
      novo: 2, mudou: 1, saiu: 1, corrigido: 1, sem_mudanca: 14,
      avisos: [
        'Prioridade "EXEMPLO" fora do mapa no defeito EXEMPLO-D9001: ficou sem prioridade.',
        'ID EXEMPLO-D9002 repetido na planilha: valeu a primeira linha ativa.',
      ],
    },
  },
  {
    id: 2, tipo: 'erro', regional: 'SUL', arquivo: '02_EXEMPLO.xlsx', quando: horasAtras(5), resumo: {},
    erro: 'A aba DEMANDA MENSAL não tem a coluna PROJETO SGM nem PROJETO WIN. Nada foi enviado.',
  },
  { id: 3, tipo: 'demanda', regional: 'LESTE', arquivo: '01_EXEMPLO.xlsx', quando: horasAtras(30), erro: null, resumo: { avisos: [] } },
]
const def = (id_gom: string, prioridade: number | null, estrutura: string) => ({
  id_gom, prioridade, estrutura, alimentador: 'ALIM-301', estado_enel: 'PENDENTE', lat: -3.73, lng: -38.52,
})
const novidades = [
  {
    id: 101, importacao_id: 1, regional: 'CS', projeto: 'EXEMPLO-0101', tipo: 'novo', situacao: 'aberta', criada_em: horasAtras(2),
    dados: { projeto: 'EXEMPLO-0101', municipio: 'Fortaleza', alimentadores: ['ALIM-301'], defeitos: [def('EXEMPLO-D0101-1', 7, 'ESTR-101A'), def('EXEMPLO-D0101-2', 7, 'ESTR-101B'), def('EXEMPLO-D0101-3', 9, 'ESTR-101C')] },
  },
  {
    id: 102, importacao_id: 1, regional: 'CS', projeto: 'EXEMPLO-0102', tipo: 'novo', situacao: 'aberta', criada_em: horasAtras(2),
    dados: { projeto: 'EXEMPLO-0102', municipio: 'Caucaia', alimentadores: ['ALIM-302'], defeitos: [def('EXEMPLO-D0102-1', 3, 'ESTR-102A')] },
  },
  {
    id: 103, importacao_id: 1, regional: 'CS', projeto: 'EXEMPLO-0002', tipo: 'mudou', situacao: 'aberta', criada_em: horasAtras(2),
    dados: { entram: [def('EXEMPLO-D0002-9', 3, 'ESTR-2A')], saem: ['EXEMPLO-D0002-1', 'EXEMPLO-D0002-2'], prioridade_antes: 2, prioridade_nova: 3, alimentadores: ['ALIM-101'] },
  },
  {
    id: 104, importacao_id: 1, regional: 'CS', projeto: 'EXEMPLO-0004', tipo: 'saiu', situacao: 'aberta', criada_em: horasAtras(2),
    dados: { etapa: 'ANÁLISE PÓS-VISTORIA' },
  },
  {
    id: 105, importacao_id: 1, regional: 'CS', projeto: 'EXEMPLO-0001', tipo: 'corrigido', situacao: 'aberta', criada_em: horasAtras(2),
    dados: { defeitos: [{ id_gom: 'EXEMPLO-D0001', estado_enel: 'CORRIGIDO' }, { id_gom: 'EXEMPLO-D0002', estado_enel: 'CORRIGIDO' }] },
  },
]

const tabelas: Record<string, any[]> = {
  projetos, defeitos, historico, parametros, equipes, motivos, solicitantes_sgd: solicitantes, perfis, importacoes, novidades,
}

// RPCs das novidades: decide a linha em memória (sem refazer a carteira; a prévia só mostra a tela).
function rpcNovidades(nome: string, a: any): { data: any; error: any } {
  const decidir = (id: number, situacao: string, escolha: string | null) => {
    const n = novidades.find((x) => x.id === id)
    if (!n) return { code: 'P0001', message: 'Novidade não encontrada.' }
    if (n.situacao !== 'aberta') return { code: 'P0001', message: 'Esta novidade já foi decidida.' }
    n.situacao = situacao
    if (situacao === 'aceita' && n.tipo === 'saiu') {
      const p = projetos.find((x) => x.projeto === n.projeto)
      if (p) {
        p.saiu_da_demanda = true
        if (escolha && escolha !== 'MANTER') p.etapa = escolha
      }
    }
    return null
  }
  if (nome === 'aceitar_novidade') return { data: null, error: decidir(a.p_id, 'aceita', a.p_escolha ?? null) }
  if (nome === 'recusar_novidade') return { data: null, error: decidir(a.p_id, 'recusada', null) }
  if (nome === 'aceitar_novidades') {
    for (const id of a.p_ids as number[]) {
      const e = decidir(id, 'aceita', null)
      if (e) return { data: null, error: e }
    }
    return { data: (a.p_ids as number[]).length, error: null }
  }
  return { data: null, error: null }
}

/** O rpc do supabase-js devolve um construtor (aceita .abortSignal) que vira promessa no await. */
function chamada(r: () => { data: any; error: any }) {
  const b: any = {
    abortSignal: (_s: unknown) => b,
    then: (ok?: (v: any) => any, ko?: (e: any) => any) => Promise.resolve().then(r).then(ok, ko),
  }
  return b
}

// ---------------------------------------------------------------------------
class Construtor implements PromiseLike<{ data: any; error: any }> {
  private filtros: ((l: any) => boolean)[] = []
  private ordem: { col: string; asc: boolean }[] = []
  private faixa: [number, number] | null = null
  private lim: number | null = null
  private modo: 'select' | 'update' | 'insert' | 'upsert' = 'select'
  private devolve = true
  private corpo: any = null
  private unico: 'single' | 'maybe' | null = null
  constructor(private nome: string) {}

  select(_c?: string) { this.devolve = true; return this }
  update(v: any) { this.modo = 'update'; this.corpo = v; this.devolve = false; return this }
  insert(v: any) { this.modo = 'insert'; this.corpo = v; this.devolve = false; return this }
  upsert(v: any, _o?: any) { this.modo = 'upsert'; this.corpo = v; this.devolve = false; return this }
  eq(c: string, v: any) { this.filtros.push((l) => l[c] === v); return this }
  neq(c: string, v: any) { this.filtros.push((l) => l[c] !== v); return this }
  in(c: string, vs: any[]) { this.filtros.push((l) => vs.includes(l[c])); return this }
  order(col: string, o?: { ascending?: boolean }) { this.ordem.push({ col, asc: o?.ascending !== false }); return this }
  range(de: number, ate: number) { this.faixa = [de, ate]; return this }
  limit(n: number) { this.lim = n; return this }
  abortSignal(_s: unknown) { return this }
  single() { this.unico = 'single'; return this }
  maybeSingle() { this.unico = 'maybe'; return this }

  private executar() {
    const tab = tabelas[this.nome] ?? (tabelas[this.nome] = [])
    const alvo = () => tab.filter((l) => this.filtros.every((f) => f(l)))
    let saida: any[] = []
    if (this.modo === 'update') {
      saida = alvo()
      for (const l of saida) {
        Object.assign(l, this.corpo)
        if ('atualizado_em' in l) l.atualizado_em = new Date().toISOString().replace('Z', '.654321+00:00')
      }
    } else if (this.modo === 'insert' || this.modo === 'upsert') {
      const novos = (Array.isArray(this.corpo) ? this.corpo : [this.corpo]).map((x: any) => ({
        ...x,
        ...(this.nome === 'projetos'
          ? { atualizado_em: new Date().toISOString(), etapa_desde: new Date().toISOString(), alimentadores: [], defeitos: null, pedido_gestor: false }
          : {}),
      }))
      tab.push(...novos)
      saida = novos
    } else {
      saida = alvo()
    }
    for (const { col, asc } of [...this.ordem].reverse()) {
      saida = [...saida].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1))
    }
    if (this.faixa) saida = saida.slice(this.faixa[0], this.faixa[1] + 1)
    if (this.lim !== null) saida = saida.slice(0, this.lim)
    const copia = saida.map((l) => structuredClone(l))
    if (this.modo !== 'select' && !this.devolve) return { data: null, error: null }
    if (this.unico === 'single') {
      return copia.length === 1 ? { data: copia[0], error: null } : { data: null, error: { message: 'Linha não encontrada', code: 'PGRST116' } }
    }
    if (this.unico === 'maybe') return { data: copia[0] ?? null, error: null }
    return { data: copia, error: null }
  }

  then<R1 = any, R2 = never>(ok?: ((v: any) => R1 | PromiseLike<R1>) | null, ko?: ((e: any) => R2 | PromiseLike<R2>) | null) {
    return Promise.resolve().then(() => this.executar()).then(ok, ko)
  }
}

let dentro = false
try { dentro = new URLSearchParams(location.search).get('previa') === 'dentro' } catch { /* sem janela */ }
const ouvintes = new Set<(e: string, s: any) => void>()
const sessao = () => ({ access_token: 'falso', user: { id: USUARIO.id, email: USUARIO.email } })

export const nuvem: any = {
  from: (t: string) => new Construtor(t),
  rpc: (n: string, a?: unknown) => chamada(() => rpcNovidades(n, a)),
  auth: {
    getSession: async () => ({ data: { session: dentro ? sessao() : null }, error: null }),
    getUser: async () => ({ data: { user: dentro ? sessao().user : null }, error: null }),
    onAuthStateChange: (cb: (e: string, s: any) => void) => {
      ouvintes.add(cb)
      return { data: { subscription: { unsubscribe: () => ouvintes.delete(cb) } } }
    },
    signInWithPassword: async (_c: unknown) => { dentro = true; return { data: { session: sessao() }, error: null } },
    signOut: async () => { dentro = false; ouvintes.forEach((cb) => cb('SIGNED_OUT', null)); return { error: null } },
    updateUser: async (_a: unknown) => ({ data: { user: sessao().user }, error: null }),
  },
}
