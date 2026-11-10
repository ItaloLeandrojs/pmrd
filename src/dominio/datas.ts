import type { DataISO } from './tipos'

const DIA_MS = 86_400_000

function paraUtc(d: DataISO): number {
  const [a, m, dia] = d.split('-').map(Number)
  return Date.UTC(a, m - 1, dia)
}

function deUtc(ms: number): DataISO {
  return new Date(ms).toISOString().slice(0, 10)
}

const formatadorFortaleza = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Fortaleza',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function hojeEmFortaleza(agora: Date): DataISO {
  return formatadorFortaleza.format(agora)
}

export function somarDias(d: DataISO, n: number): DataISO {
  return deUtc(paraUtc(d) + n * DIA_MS)
}

export function diasEntre(de: DataISO, ate: DataISO): number {
  return Math.round((paraUtc(ate) - paraUtc(de)) / DIA_MS)
}

export function semanaIso(d: DataISO): { ano: number; semana: number; segunda: DataISO; domingo: DataISO } {
  const diaSemana = (new Date(paraUtc(d)).getUTCDay() + 6) % 7 // segunda = 0
  const segunda = somarDias(d, -diaSemana)
  const quinta = somarDias(segunda, 3)
  const ano = Number(quinta.slice(0, 4))
  const semana = Math.floor(diasEntre(`${ano}-01-01`, quinta) / 7) + 1
  return { ano, semana, segunda, domingo: somarDias(segunda, 6) }
}

export function formatarBR(d: DataISO): string {
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}
