import { defineConfig } from 'vitest/config'

// Regras de domínio e banco (PGlite) rodam em node; telas React rodam em jsdom.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'telas',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/testes/preparar.ts'],
        },
      },
    ],
  },
})
