from datetime import datetime

from pydantic import BaseModel, EmailStr


class ProfessorCreate(BaseModel):
    nome: str
    email: EmailStr
    senha: str


class ProfessorRead(BaseModel):
    id: int
    nome: str
    email: EmailStr


class AlunoCreate(BaseModel):
    nome: str
    email: EmailStr
    senha: str


class AlunoRead(BaseModel):
    id: int
    nome: str
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    senha: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tipo: str


class TurmaCreate(BaseModel):
    nome: str


class TurmaRead(BaseModel):
    id: int
    nome: str
    codigo_turma: str
    professor_id: int
    created_at: datetime


class TurmaEntrarRequest(BaseModel):
    codigo_turma: str
