import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sem globals no vitest, o Testing Library não limpa a tela sozinho entre os testes.
afterEach(() => cleanup())
