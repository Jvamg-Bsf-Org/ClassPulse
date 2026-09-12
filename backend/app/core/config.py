from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://classpulse:classpulse@localhost:5432/classpulse"
    jwt_secret: str = "change-me-in-.env"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    # False só em dev local sem HTTPS (docker-compose). Em prod (Render/Railway atrás de HTTPS) deixa True.
    refresh_cookie_secure: bool = True
    # Onde está o build do frontend (frontend/dist). None = calcula relativo a este arquivo
    # (backend/frontend_dist) — usado quando roda fora de Docker. O Dockerfile seta essa env
    # var apontando pra fora de /app, pra sobreviver ao bind mount do docker-compose em dev.
    frontend_dist_path: str | None = None


settings = Settings()
