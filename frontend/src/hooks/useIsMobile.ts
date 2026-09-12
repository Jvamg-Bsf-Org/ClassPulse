import { useEffect, useState } from 'react'

const QUERY = '(max-width: 768px)'

/**
 * Distinção simples desktop x mobile: em telas largas mostramos só a
 * interface do professor, em telas estreitas só a do aluno. Não é uma
 * verificação de segurança (dá pra simular no DevTools), é só roteamento de
 * produto — professor usa notebook/projetor, aluno usa o próprio celular.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', listener)
    return () => mql.removeEventListener('change', listener)
  }, [])

  return isMobile
}
