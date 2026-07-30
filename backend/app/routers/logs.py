"""
Journal des actions — accessible uniquement aux admins.
"""
from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models.devis import ActionLog
from app.auth.jwt import get_current_user, TokenData
from fastapi import HTTPException

router = APIRouter(prefix="/logs", tags=["logs"])


class LogOut(BaseModel):
    id: int
    horodatage: datetime
    utilisateur: str
    action: str
    module: str
    reference: str | None = None
    detail: str | None = None

    model_config = {"from_attributes": True}


def _require_admin(current: TokenData = Depends(get_current_user)) -> TokenData:
    if "admin" not in current.roles:
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs.")
    return current


@router.get("", response_model=list[LogOut])
def list_logs(
    limit: int = 200,
    db: Session = Depends(get_db),
    _: TokenData = Depends(_require_admin),
):
    rows = db.scalars(
        select(ActionLog).order_by(desc(ActionLog.horodatage)).limit(limit)
    ).all()
    return rows
