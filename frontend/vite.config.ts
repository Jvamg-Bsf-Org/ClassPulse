import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:8000',
      '/professores': 'http://localhost:8000',
      '/alunos': 'http://localhost:8000',
      '/turmas': 'http://localhost:8000',
      '/aulas': 'http://localhost:8000',
      '/quizzes': 'http://localhost:8000',
      '/partidas': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
