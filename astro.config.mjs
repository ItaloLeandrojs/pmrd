import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv } from 'vite'

// O build precisa das duas variáveis públicas do Supabase (a política de segurança usa a URL).
function exigirVariaveis() {
  return {
    name: 'exigir-variaveis-supabase',
    hooks: {
      'astro:config:setup': ({ command }) => {
        if (command !== 'build') return
        const env = loadEnv('production', process.cwd(), 'PUBLIC_')
        if (!env.PUBLIC_SUPABASE_URL) {
          throw new Error('Falta PUBLIC_SUPABASE_URL no .env.local (copie o .env.exemplo)')
        }
        if (!env.PUBLIC_SUPABASE_ANON_KEY) {
          throw new Error('Falta PUBLIC_SUPABASE_ANON_KEY no .env.local (copie o .env.exemplo)')
        }
      },
    },
  }
}

// Política de segurança (no Fechamento era uma meta feita à mão). O Astro injeta scripts
// inline para montar a tela (ilhas React) e, com security.csp, calcula o hash de cada um e
// o coloca em script-src. Sem isso, 'script-src self' bloquearia a hidratação no navegador.
const urlSupabase = loadEnv('production', process.cwd(), 'PUBLIC_').PUBLIC_SUPABASE_URL ?? ''

export default defineConfig({
  output: 'static',
  site: 'https://italoleandrojs.github.io',
  base: '/pmrd',
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' blob: data:",
        "font-src 'self'",
        `connect-src 'self' ${urlSupabase}`.trim(),
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ],
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
  integrations: [react(), exigirVariaveis()],
  // assetsInlineLimit 0: as fontes ficam como arquivos em /_astro (font-src 'self'). Sem isso, o Vite embutia
  // as menores como data: no CSS e a política as bloqueava (erro no console do build de produção).
  vite: { plugins: [tailwindcss()], build: { assetsInlineLimit: 0 } },
})
