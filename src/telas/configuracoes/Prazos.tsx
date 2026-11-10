// Prazos e limites: 7 números inteiros positivos, uma linha única no banco.
import { useEffect, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { carregarParametros, salvarParametros, type Parametros } from '../../nuvem/configuracoes'
import { mensagemDeErro } from '../../nuvem/erros'

const CAMPOS: { chave: keyof Parametros; rotulo: string }[] = [
  { chave: 'validade_vistoria', rotulo: 'Validade da vistoria (dias)' },
  { chave: 'prazo_reenvio_vistoria', rotulo: 'Prazo para reenviar vistoria (dias)' },
  { chave: 'alerta_vencimento', rotulo: 'Alerta de vencimento (dias)' },
  { chave: 'alerta_prazo', rotulo: 'Alerta de prazo (dias)' },
  { chave: 'parado_amarelo', rotulo: 'Parado amarelo (dias)' },
  { chave: 'parado_vermelho', rotulo: 'Parado vermelho (dias)' },
  { chave: 'raio_mapa_km', rotulo: 'Raio do mapa (km)' },
]

export function Prazos({ c }: { c: SupabaseClient }) {
  const [valores, setValores] = useState<Record<keyof Parametros, string> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let vivo = true
    carregarParametros(c)
      .then((p) => {
        if (!vivo) return
        setValores(Object.fromEntries(CAMPOS.map(({ chave }) => [chave, String(p[chave])])) as Record<keyof Parametros, string>)
      })
      .catch((e) => { if (vivo) setErro(mensagemDeErro(e)) })
    return () => { vivo = false }
  }, [c])

  async function gravar(e: FormEvent) {
    e.preventDefault()
    if (!valores || salvando) return
    setOk(false)
    const p = {} as Parametros
    for (const { chave, rotulo } of CAMPOS) {
      const t = valores[chave].trim()
      if (!/^\d+$/.test(t) || Number(t) < 1) return setErro(`${rotulo}: use um número inteiro maior que zero.`)
      p[chave] = Number(t)
    }
    setErro(null)
    setSalvando(true)
    try {
      await salvarParametros(c, p)
      setOk(true)
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  if (!valores) {
    return erro
      ? <p className="cfg__erro" role="alert"><WarningCircle size={18} weight="bold" aria-hidden="true" />{erro}</p>
      : <p className="cfg__vazio" role="status">Carregando...</p>
  }

  return (
    <form className="cfg__form cfg__form--prazos" onSubmit={gravar} noValidate>
      <div className="cfg__grade">
        {CAMPOS.map(({ chave, rotulo }) => (
          <div key={chave}>
            <label className="cfg__rotulo" htmlFor={`pz-${chave}`}>{rotulo}</label>
            <input id={`pz-${chave}`} className="cfg__entrada cfg__mono" inputMode="numeric" value={valores[chave]}
              onChange={(e) => { setOk(false); setValores({ ...valores, [chave]: e.target.value }) }} />
          </div>
        ))}
      </div>
      {erro && <p className="cfg__erro" role="alert"><WarningCircle size={18} weight="bold" aria-hidden="true" />{erro}</p>}
      {ok && <p className="cfg__ok" role="status"><CheckCircle size={18} weight="bold" aria-hidden="true" />Prazos salvos.</p>}
      <div className="cfg__acoes">
        <button type="submit" className="cfg__botao cfg__botao--forte" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar prazos'}
        </button>
      </div>
    </form>
  )
}
