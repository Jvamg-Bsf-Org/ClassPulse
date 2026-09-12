from fastapi import FastAPI

from app.routers import alunos, auth, professores, turmas

app = FastAPI(title="ClassPulse API")

app.include_router(auth.router)
app.include_router(professores.router)
app.include_router(alunos.router)
app.include_router(turmas.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
