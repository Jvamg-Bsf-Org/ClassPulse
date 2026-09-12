import { useEffect, useState } from 'react'

type ApiStatus = 'checking' | 'ok' | 'erro'

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')

  useEffect(() => {
    fetch('/health')
      .then((res) => (res.ok ? setApiStatus('ok') : setApiStatus('erro')))
      .catch(() => setApiStatus('erro'))
  }, [])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 480 }}>
      <h1>ClassPulse</h1>
      <p>Frontend placeholder — o time de front vai construir a interface real aqui.</p>
      <p>
        Status da API (<code>GET /health</code>): <strong>{apiStatus}</strong>
      </p>
    </main>
  )
}

export default App
