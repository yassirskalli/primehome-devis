from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel
from app.config import get_settings

settings = get_settings()
bearer = HTTPBearer(auto_error=False)

UNAUTH = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide ou expiré.")


class TokenData(BaseModel):
    sub: str
    roles: List[str] = []


def create_access_token(sub: str, roles: List[str]) -> str:
    expire = datetime.now(tz=timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": sub, "roles": roles, "exp": expire}, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> TokenData:
    if not creds:
        raise UNAUTH
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        sub = payload.get("sub")
        if not sub:
            raise UNAUTH
        return TokenData(sub=sub, roles=payload.get("roles", []))
    except JWTError:
        raise UNAUTH
