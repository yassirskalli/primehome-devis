from __future__ import annotations
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine, Base
import app.models  # noqa

from app.routers import auth, devis, clients, catalogue, odoo, logs

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.debug:
        Base.metadata.create_all(bind=engine)
        logger.info("Tables créées.")
    yield


app = FastAPI(
    title="Devis Miele — Prime Home SARL",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(devis.router)
app.include_router(clients.router)
app.include_router(catalogue.router)
app.include_router(odoo.router)
app.include_router(logs.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "devis-miele"}
