import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import LoginScreen from './LoginScreen'

describe('LoginScreen SSR / Component Render', () => {
  it('renders default role Professor correctly', () => {
    const html = renderToString(<LoginScreen initialRole="professor" onLogado={vi.fn()} />)
    expect(html).toContain('Área do Professor')
    expect(html).toContain('Professor')
    expect(html).toContain('Aluno')
    expect(html).toContain('Entrar como Professor')
  })

  it('renders role Aluno correctly when initialRole is aluno', () => {
    const html = renderToString(<LoginScreen initialRole="aluno" onLogado={vi.fn()} />)
    expect(html).toContain('Área do Aluno')
    expect(html).toContain('Entrar como Aluno')
  })
})
