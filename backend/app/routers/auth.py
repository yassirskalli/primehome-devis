from fastapi import APIRouter
from pydantic import BaseModel
from app.auth.jwt import create_access_token
from fastapi import HTTPException, status

router = APIRouter(prefix="/auth", tags=["auth"])

# Utilisateurs partagés avec miele_erp (même JWT_SECRET_KEY)
# En production : brancher sur la même DB users que miele_erp
_USERS = {
    "admin":       ("admin123",   ["admin", "commercial", "odoo_manager"]),
    "commercial1": ("comm1miele", ["commercial"]),
    "commercial2": ("comm2miele", ["commercial"]),
    "odoo":        ("odoomiele",  ["odoo_manager"]),
}


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/token", response_model=TokenOut)
def login(payload: LoginIn):
    user = _USERS.get(payload.username)
    if not user or user[0] != payload.password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants incorrects.")
    return TokenOut(access_token=create_access_token(sub=payload.username, roles=user[1]))
