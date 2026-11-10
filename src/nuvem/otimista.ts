// Lista com edição otimista: a linha muda na hora e volta atrás, com aviso, se o servidor não aceitar.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ResultadoGravacao } from './carteira'
import { avisarFora } from './avisoFora'
import { mensagemDeErro } from './erros'

const AVISO_MS = 7000

interface Operacao<T> {
  mudanca: Partial<T>
  /** Valores que os campos tinham logo antes desta mudança. */
  antes: Partial<T>
  enviar: (linhaAtual: T) => Promise<ResultadoGravacao>
  terminar: () => void
}

export function useListaOtimista<T extends object, K extends keyof T>(inicial: T[], chave: K) {
  // A referência é a verdade síncrona: gravações em sequência na mesma linha leem o valor mais novo.
  const ref = useRef<T[]>(inicial)
  const [linhas, setLinhas] = useState<T[]>(inicial)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendentes, setPendentes] = useState<ReadonlySet<T[K]>>(new Set())
  const filas = useRef(new Map<T[K], { ops: Operacao<T>[]; rodando: boolean }>())

  // A fila continua enviando depois que a pessoa troca de tela; o erro então vai para a casca.
  const montado = useRef(true)
  useEffect(() => {
    montado.current = true
    return () => { montado.current = false }
  }, [])

  const avisar = (id: T[K], mensagem: string) => {
    if (montado.current) setAviso(mensagem)
    else avisarFora(`${String(id)}: ${mensagem}`)
  }

  useEffect(() => {
    if (aviso === null) return
    const t = setTimeout(() => setAviso(null), AVISO_MS)
    return () => clearTimeout(t)
  }, [aviso])

  const trocar = (id: T[K], f: (l: T) => T) => {
    ref.current = ref.current.map((x) => (x[chave] === id ? f(x) : x))
    setLinhas(ref.current)
  }

  const marcarPendentes = () => {
    setPendentes(new Set([...filas.current].filter(([, f]) => f.ops.length > 0).map(([id]) => id)))
  }

  /** Volta só os campos que ainda têm o valor que esta mudança pôs (ninguém mexeu depois). */
  const desfazer = (id: T[K], op: Operacao<T>) =>
    trocar(id, (l) => {
      const volta: Partial<T> = {}
      for (const k of Object.keys(op.mudanca) as (keyof T)[]) {
        if (Object.is(l[k], op.mudanca[k])) volta[k] = op.antes[k]
      }
      return { ...l, ...volta }
    })

  /** Descarta o que ficou esperando na fila da linha, desfazendo o que essas mudanças mostraram. */
  const descartarFila = (id: T[K], desfazendo: boolean) => {
    const fila = filas.current.get(id)
    if (!fila) return
    const descartadas = fila.ops.splice(0)
    if (desfazendo) for (const o of [...descartadas].reverse()) desfazer(id, o)
    descartadas.forEach((o) => o.terminar())
  }

  const rodar = async (id: T[K]) => {
    const fila = filas.current.get(id)!
    fila.rodando = true
    while (fila.ops.length > 0) {
      const op = fila.ops[0]
      let r: ResultadoGravacao
      try {
        r = await op.enviar(ref.current.find((x) => x[chave] === id) as T)
      } catch (e) {
        r = { ok: false, motivo: 'rede', mensagem: `Não salvou: ${mensagemDeErro(e)} A mudança foi desfeita.` }
      }
      if (r.ok) {
        fila.ops.shift()
        // A resposta traz o atualizado_em novo; o que ainda espera na fila continua aparecendo.
        const esperando = fila.ops.reduce<Partial<T>>((acc, o) => ({ ...acc, ...o.mudanca }), {})
        trocar(id, () => ({ ...(r.linha as unknown as T), ...esperando }))
        op.terminar()
      } else if (r.motivo === 'conflito' && r.atual) {
        descartarFila(id, false)
        trocar(id, () => r.atual as unknown as T)
        avisar(id, r.mensagem)
      } else {
        descartarFila(id, true)
        avisar(id, r.mensagem)
      }
      marcarPendentes()
    }
    fila.rodando = false
  }

  /**
   * A mudança aparece na hora. O envio é uma gravação por linha de cada vez: `enviar` recebe a linha como está
   * no momento do envio (com o atualizado_em mais recente). Se uma falha ou conflito, as que esperavam na fila
   * são descartadas, nunca enviadas às cegas.
   */
  const gravar = (
    id: T[K],
    mudanca: Partial<T>,
    enviar: (linhaAtual: T) => Promise<ResultadoGravacao>,
  ): Promise<void> => {
    const atual = ref.current.find((x) => x[chave] === id)
    if (!atual) return Promise.resolve()
    const antes = Object.fromEntries(Object.keys(mudanca).map((k) => [k, atual[k as keyof T]])) as Partial<T>
    trocar(id, (l) => ({ ...l, ...mudanca }))
    return new Promise<void>((terminar) => {
      let fila = filas.current.get(id)
      if (!fila) {
        fila = { ops: [], rodando: false }
        filas.current.set(id, fila)
      }
      fila.ops.push({ mudanca, antes, enviar, terminar })
      marcarPendentes()
      if (!fila.rodando) void rodar(id)
    })
  }

  const fecharAviso = useCallback(() => setAviso(null), [])

  return { linhas, aviso, gravar, fecharAviso, pendentes }
}
