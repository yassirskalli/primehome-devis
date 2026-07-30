from __future__ import annotations
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.devis import Client
from app.auth.jwt import get_current_user, TokenData

router = APIRouter(prefix="/clients", tags=["clients"])


class ClientIn(BaseModel):
    nom: str
    prenom: Optional[str] = None
    telephone: Optional[str] = None
    email: Optional[str] = None
    adresse: Optional[str] = None
    ville: Optional[str] = "Casablanca"
    ice: Optional[str] = None


class ClientOut(BaseModel):
    id: int
    nom: str
    prenom: Optional[str]
    telephone: Optional[str]
    email: Optional[str]
    adresse: Optional[str]
    ville: Optional[str]
    ice: Optional[str]

    class Config:
        from_attributes = True


@router.get("", response_model=List[ClientOut])
def list_clients(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    query = select(Client).order_by(Client.nom)
    if q:
        query = query.where(Client.nom.ilike(f"%{q}%"))
    return db.scalars(query).all()


@router.post("", response_model=ClientOut, status_code=201)
def create_client(payload: ClientIn, db: Session = Depends(get_db), _: TokenData = Depends(get_current_user)):
    client = Client(**payload.model_dump())
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.patch("/{client_id}", response_model=ClientOut)
def update_client(client_id: int, payload: ClientIn, db: Session = Depends(get_db), _: TokenData = Depends(get_current_user)):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable.")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(client, k, v)
    db.commit()
    db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=204)
def delete_client(client_id: int, db: Session = Depends(get_db), _: TokenData = Depends(get_current_user)):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable.")
    db.delete(client)
    db.commit()
