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


settings = Settings()
