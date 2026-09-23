import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.auth.jwt import create_access_token
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/token", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    result = db.execute(select(User).where(User.username == payload.username, User.actif == True))
    user = result.scalar_one_or_none()
    if not user or not bcrypt.checkpw(payload.password.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants incorrects.")
    roles = [r.strip() for r in user.roles.split(",")]
    return TokenOut(access_token=create_access_token(sub=payload.username, roles=roles))
