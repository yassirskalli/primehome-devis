"""
Gestion des utilisateurs Devis — CRUD réservé aux admins.
Synchronisé depuis le module Administration du portail.
"""
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.auth.jwt import get_current_user, TokenData
from app.database import get_db
from app.models.devis import User

router = APIRouter(prefix="/users", tags=["Utilisateurs"])


class UserCreate(BaseModel):
    username: str
    password: str
    roles: str  # comma-separated: "admin,commercial"


class UserUpdate(BaseModel):
    roles: Optional[str] = None
    password: Optional[str] = None
    actif: Optional[bool] = None


class UserOut(BaseModel):
    id: int
    username: str
    roles: str
    actif: bool

    class Config:
        from_attributes = True


def _require_admin(current: TokenData = Depends(get_current_user)) -> TokenData:
    if "admin" not in current.roles:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs.")
    return current


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: TokenData = Depends(_require_admin)):
    return db.scalars(select(User).order_by(User.username)).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: TokenData = Depends(_require_admin),
):
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(409, detail="Nom d'utilisateur déjà utilisé.")
    hashed = bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode()
    user = User(username=payload.username, password_hash=hashed, roles=payload.roles, actif=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{username}", response_model=UserOut)
def update_user(
    username: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _: TokenData = Depends(_require_admin),
):
    user = db.scalar(select(User).where(User.username == username))
    if not user:
        raise HTTPException(404, detail="Utilisateur introuvable.")
    if payload.roles is not None:
        user.roles = payload.roles
    if payload.password is not None:
        user.password_hash = bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode()
    if payload.actif is not None:
        user.actif = payload.actif
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{username}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    username: str,
    db: Session = Depends(get_db),
    _: TokenData = Depends(_require_admin),
):
    user = db.scalar(select(User).where(User.username == username))
    if user:
        db.delete(user)
        db.commit()
