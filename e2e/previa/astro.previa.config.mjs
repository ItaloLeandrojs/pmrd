// Prévia só de teste: o mesmo astro.config.mjs do projeto, com src/nuvem/cliente.ts trocado por um
// cliente em memória com dados fictícios (e2e/previa/cliente-falso.ts). Nenhuma chamada à rede.
// Gera a pasta dist-previa (fora do Git): `npm run previa:montar`.
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = process.env.PREVIA_RAIZ ?? process.cwd()
const requer = createRequire(path.join(raiz, 'package.json'))
const { mergeConfig } = await import(pathToFileURL(requer.resolve('astro/config')).href)
const base = (await import(pathToFileURL(path.join(raiz, 'astro.config.mjs')).href)).default

const alvo = path.join(raiz, 'src', 'nuvem', 'cliente').toLowerCase()
const falso = path.join(aqui, 'cliente-falso.ts')

const trocaCliente = {
  name: 'previa-cliente-falso',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return null
    const limpo = importer.split('?')[0]
    const r = path.resolve(path.dirname(limpo), source).replace(/\.ts$/, '').toLowerCase()
    return r === alvo ? falso : null
  },
}

export default mergeConfig(base, {
  root: raiz,
  outDir: 'dist-previa',
  cacheDir: 'node_modules/.astro-previa',
  vite: { plugins: [trocaCliente], server: { fs: { allow: [raiz, aqui] } } },
})
