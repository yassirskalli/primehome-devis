from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Base de données — obligatoire
    database_url: str

    # JWT — secret obligatoire, min 32 chars
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480  # 8 heures

    # Communication inter-services
    order_tracking_url: str = "http://erp_api:8000"
    order_tracking_token: str = ""

    debug: bool = False

    # Odoo (lecture seule)
    odoo_url: str = "http://odoo:8069"
    odoo_db: str = "odoo"
    odoo_user: str  # Obligatoire
    odoo_password: str  # Obligatoire

    # Société (non sensibles)
    company_name: str = "PRIME HOME SARL"
    company_capital: str = "300 000 DH"
    company_address: str = "413, Route Al Jamiaa (ex Route Eljadida), Oasis Casablanca"
    company_tel: str = "+212 522 254 732"
    company_email: str = "contact@prime-home.ma"
    company_website: str = "https://www.miele.co.ma"
    company_rc: str = "591297"
    company_ice: str = "003278319000021"
    company_if: str = "53752089"

    @field_validator("jwt_secret_key")
    @classmethod
    def jwt_must_be_strong(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("JWT_SECRET_KEY doit faire au moins 32 caractères")
        return v

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
