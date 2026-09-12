from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.ws_manager import manager
from app.routers import alunos, auth, partidas, professores, quizzes, turmas

app = FastAPI(title="ClassPulse API")

app.include_router(auth.router)
app.include_router(professores.router)
app.include_router(alunos.router)
app.include_router(turmas.router)
app.include_router(quizzes.router)
app.include_router(partidas.router)


@app.websocket("/ws/aulas/{aula_id}")
async def websocket_aula(websocket: WebSocket, aula_id: int):
    await manager.connect(aula_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(aula_id, websocket)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}



# Monólito: o build do frontend (frontend/dist) é copiado pra dentro da imagem em
# backend/frontend_dist (ver Dockerfile). Se não existir (ex: rodando a API sozinha
# em dev sem ter buildado o front), a API funciona normalmente sem servir nada em "/".
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend_dist"

if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def servir_frontend(full_path: str) -> FileResponse:
        candidato = FRONTEND_DIST / full_path
        if full_path and candidato.is_file():
            return FileResponse(candidato)
        return FileResponse(FRONTEND_DIST / "index.html")
