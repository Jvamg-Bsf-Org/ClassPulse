# ClassPulse

PWA que ajuda o professor a gerenciar o uso do celular em sala de aula sem precisar confiscar o aparelho. A aula alterna entre três modos — **Livre**, **Foco** e **Atividade** — e o app acompanha dois indicadores separados: um **Score de Foco** privado do aluno (nunca visível ao professor) e um **Score de Aprendizagem** agregado, visível ao professor.

Aplicação no ar: https://classpulse-app.up.railway.app/

## Como funciona

- **Modo Livre** — uso do celular liberado, sem monitoramento.
- **Modo Foco** — o aluno vira o celular de bruços (ou deixa parado); sensores de orientação e movimento do navegador confirmam isso em tempo real, sem nenhuma leitura de câmera, áudio ou outros apps.
- **Modo Atividade** — o professor dispara um quiz que aparece na hora na tela dos alunos, individual ou em grupo, competitivo ou cooperativo.

Professor e aluno entram em turmas e aulas por código (sem QR code): o aluno se matricula numa turma uma vez com o código da turma, e digita um código novo a cada aula — isso é proposital, pra falta não contaminar o histórico.

## Stack

- **Backend**: FastAPI + SQLModel + Alembic, Python 3.12, gerenciado com [uv](https://docs.astral.sh/uv/).
- **Frontend**: React + TypeScript, Vite.
- **Banco**: Postgres ([Neon](https://neon.tech/) em produção).
- **Tempo real**: WebSocket nativo (troca de modo, quizzes, encerramento de aula).
- **Deploy**: monólito único (o backend serve a API e os arquivos estáticos do build do frontend) em container no [Railway](https://railway.app/).

## Rodando localmente

Forma mais simples, com Docker (sobe Postgres + API já migrada):

```bash
cp backend/.env.example backend/.env
docker compose up
```

A API sobe em `http://localhost:8000`. Pra rodar o frontend em modo dev (com hot reload) à parte:

```bash
cd frontend
npm install
npm run dev
```

## Testes

```bash
# backend
cd backend && uv run pytest

# frontend
cd frontend && npm test
```
Obs: A stack em dev pode ter partes não-funcionais por não conter certificado tls, impedindo funcionamento de sensores.

## Time

Bento Salles Florido e João Vitor Araujo Moraes Guzzo.

Projeto feito para o Hackaton HackTudo 2026.
