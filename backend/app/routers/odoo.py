"""
Router Odoo pour le module Devis.
Endpoints :
  GET  /odoo/clients?q=         Recherche partenaires temps réel (autocomplete)
  POST /odoo/sync-clients       Import/upsert tous les clients Odoo → table clients
  GET  /odoo/produits?q=        Recherche produits temps réel
  POST /odoo/sync-produits      Import/upsert tous les produits Odoo → catalogue_data.json
"""
from __future__ import annotations
import json
import os
import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.devis import Client
from app.auth.jwt import get_current_user, TokenData
import app.services.odoo_client as odoo

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/odoo", tags=["odoo"])

_CATALOGUE_PATH = os.path.join(os.path.dirname(__file__), "..", "catalogue_data.json")


# ── Schémas de réponse ──────────────────────────────────────────────────────

class OdooClientOut(BaseModel):
    odoo_id: int
    nom: str
    telephone: Optional[str] = None
    email: Optional[str] = None
    adresse: Optional[str] = None
    ville: Optional[str] = None
    ice: Optional[str] = None


class OdooProduitOut(BaseModel):
    odoo_id: int
    ref: Optional[str] = None
    nom: str
    prix: float
    categorie: Optional[str] = None
    description: Optional[str] = None


class SyncResult(BaseModel):
    crees: int
    mis_a_jour: int
    total_odoo: int


# ── Helpers ─────────────────────────────────────────────────────────────────

def _s(v: object) -> str | None:
    """Convertit False/None Odoo en None Python, sinon retourne la string."""
    if not v:
        return None
    return str(v)


def _partner_to_out(p: dict) -> OdooClientOut:
    phone = _s(p.get("phone")) or _s(p.get("mobile"))
    return OdooClientOut(
        odoo_id=p["id"],
        nom=str(p["name"]),
        telephone=phone,
        email=_s(p.get("email")),
        adresse=_s(p.get("street")),
        ville=_s(p.get("city")),
        ice=_s(p.get("vat")),
    )


def _product_to_out(p: dict) -> OdooProduitOut:
    categ = p.get("categ_id")
    categ_name = categ[1] if isinstance(categ, (list, tuple)) and len(categ) > 1 else None
    return OdooProduitOut(
        odoo_id=p["id"],
        ref=_s(p.get("default_code")),
        nom=str(p["name"]),
        prix=float(p.get("list_price") or 0),
        categorie=_s(categ_name),
        description=_s(p.get("description_sale")),
    )


# ── Clients ──────────────────────────────────────────────────────────────────

@router.get("/clients", response_model=List[OdooClientOut])
def search_clients_odoo(
    q: str = Query(default="", min_length=1),
    limit: int = Query(default=20, le=100),
    _: TokenData = Depends(get_current_user),
):
    """Recherche temps réel dans Odoo (pour l'autocomplete du devis)."""
    try:
        partners = odoo.search_partners(q, limit=limit)
        return [_partner_to_out(p) for p in partners]
    except Exception as exc:
        logger.error("Odoo search_partners error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Erreur Odoo : {exc}")


@router.post("/sync-clients", response_model=SyncResult)
def sync_clients(
    db: Session = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    """
    Importe / met à jour tous les clients Odoo dans la table locale.
    Upsert basé sur le nom (insensible à la casse).
    """
    try:
        partners = odoo.get_all_partners()
    except Exception as exc:
        logger.error("Odoo get_all_partners error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Erreur Odoo : {exc}")

    crees = 0
    mis_a_jour = 0

    for p in partners:
        if not p.get("name"):
            continue
        out = _partner_to_out(p)
        existing = db.scalars(
            select(Client).where(Client.nom.ilike(out.nom))
        ).first()

        if existing:
            existing.telephone = out.telephone or existing.telephone
            existing.email = out.email or existing.email
            existing.adresse = out.adresse or existing.adresse
            existing.ville = out.ville or existing.ville
            existing.ice = out.ice or existing.ice
            mis_a_jour += 1
        else:
            client = Client(
                nom=out.nom,
                telephone=out.telephone,
                email=out.email,
                adresse=out.adresse,
                ville=out.ville or "Casablanca",
                ice=out.ice,
            )
            db.add(client)
            crees += 1

    db.commit()
    return SyncResult(crees=crees, mis_a_jour=mis_a_jour, total_odoo=len(partners))


# ── Produits ─────────────────────────────────────────────────────────────────

@router.get("/produits", response_model=List[OdooProduitOut])
def search_produits_odoo(
    q: str = Query(default="", min_length=1),
    limit: int = Query(default=30, le=100),
    _: TokenData = Depends(get_current_user),
):
    """Recherche temps réel dans les produits Odoo."""
    try:
        products = odoo.search_products(q, limit=limit)
        return [_product_to_out(p) for p in products]
    except Exception as exc:
        logger.error("Odoo search_products error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Erreur Odoo : {exc}")


@router.post("/sync-produits", response_model=SyncResult)
def sync_produits(_: TokenData = Depends(get_current_user)):
    """
    Importe tous les produits Odoo et met à jour catalogue_data.json.
    Les produits Odoo s'ajoutent/remplacent les entrées existantes (par ref).
    Les produits locaux sans équivalent Odoo sont conservés.
    """
    try:
        products = odoo.get_all_products()
    except Exception as exc:
        logger.error("Odoo get_all_products error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Erreur Odoo : {exc}")

    # Charger le catalogue existant — indexé par SKU (ref = default_code)
    try:
        with open(_CATALOGUE_PATH, encoding="utf-8") as f:
            existing: list[dict] = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        existing = []

    # Indexer par SKU (default_code) pour déduplication fiable
    existing_by_sku: dict[str, dict] = {}
    max_id = 0
    for item in existing:
        sku = item.get("sku", "").strip()
        if sku:
            existing_by_sku[sku] = item
        if item.get("id", 0) > max_id:
            max_id = item["id"]

    TRADUCTION_CAT = {
        "Washing machines frontloader": "Lave-linge", "Washer-dryer": "Lave-linge séchant",
        "Heat-pump dryer": "Sèche-linge", "Tumble dryer accessories": "Accessoires sèche-linge",
        "Oven <= 60 cm": "Four <= 60 cm", "Oven ≤ 60 cm": "Four <= 60 cm", "Oven > 60 cm": "Four > 60 cm",
        "Compact oven with microwave 60 cm": "Four compact avec micro-ondes 60 cm",
        "Combi steam oven 60 cm, st. steel cavity": "Four vapeur combiné 60 cm inox",
        "Combi steam oven 60cm, enamel cavity": "Four vapeur combiné 60 cm émail",
        "Combi steam oven 45 cm, st. steel cavity": "Four vapeur combiné 45 cm inox",
        "Compact steam oven, built in": "Four vapeur compact encastrable",
        "Microwave oven, 45cm niche, built in": "Micro-ondes encastrable 45 cm",
        "Microwave oven, 35cm niche, built in": "Micro-ondes encastrable 35 cm",
        "Fully integrated dishwasher 60 cm": "Lave-vaisselle intégrable 60 cm",
        "Integrated dishwasher 60 cm": "Lave-vaisselle encastrable 60 cm",
        "Freestanding dishwasher 60 cm": "Lave-vaisselle posable 60 cm",
        "Wall decor hood": "Hotte murale décorative", "Slimline cooker hood": "Hotte escamotable",
        "Built-under and slot-in cooker hood": "Hotte sous-meuble", "Island decor hood": "Hotte îlot décorative",
        "Cooktop extractor": "Table avec extraction intégrée", "Downdraft extractor": "Hotte aspirante encastrée",
        "Hob unit with cooktop extraction": "Table avec hotte intégrée",
        "Self-cont. ceramic hob unit - Induction": "Table induction", "Induction": "Table induction",
        "Self-contained ceramic hob unit - Gas": "Table mixte gaz/induction",
        "Self-cont. ceramic hob unit - Electric": "Table vitrocéramique",
        "Self-contained hob unit - Gas": "Table gaz",
        "CombiSet Gas": "CombiSet gaz", "CombiSet other constructions": "CombiSet",
        "Coffee machine - 45 cm niche, 60 cm": "Machine café encastrable",
        "Coffee machine (countertop) CM5": "Machine café posable CM5",
        "Coffee machine (countertop) CM6": "Machine café posable CM6",
        "Coffee machine (countertop) CM7": "Machine café posable CM7",
        "MasterCool bottom freezer": "Réfrigérateur MasterCool", "MasterCool refrigeration": "Réfrigération MasterCool",
        "MasterCool freezer": "Congélateur MasterCool",
        "Built-in bottom freezer, 60 cm wide": "Réfrigérateur combiné encastrable 60 cm",
        "Built-in refrigerator > 88 cm": "Réfrigérateur encastrable > 88 cm",
        "Built-in freezer  > 88 cm": "Congélateur encastrable > 88 cm",
        "Built-in freezer <= 88 cm": "Congélateur encastrable <= 88 cm",
        "Freestanding refrigerator > 90 cm": "Réfrigérateur posable > 90 cm",
        "Freestanding freezer  > 90 cm": "Congélateur posable > 90 cm",
        "Freestanding bottom freezer": "Réfrigérateur combiné posable",
        "Blizzard": "Blizzard", "Built-under refrigerators": "Réfrigérateur sous-plan",
        "Vacuum Sealing drawer": "Tiroir sous-vide", "system drawer": "Tiroir encastrable",
        "Duoflex": "Aspirateur balai Duoflex", "Complete C3": "Aspirateur Complete C3",
        "Complete C3 + Guard M": "Aspirateur Complete C3 + Guard M",
        "Compact C2": "Aspirateur Compact C2", "Compact C2 + Guard S": "Aspirateur Compact C2 + Guard S",
        "Classic C1": "Aspirateur Classic C1", "Guard L": "Guard L",
        "Vaccums Accessories": "Accessoires aspirateur", "Triflex": "Aspirateur balai Triflex",
        "Boost": "Aspirateur balai Boost", "Detergents": "Détergents & consommables",
        "Steam ironing system": "Station de repassage vapeur", "Rotary ironer": "Repasseuse",
        "Accessoires cuisine": "Accessoires cuisine",
    }

    def _univers(cat_fr: str) -> str:
        if any(x in cat_fr for x in ["Lave-linge","Sèche-linge","Repasseuse","Station"]):
            return "Linge"
        if any(x in cat_fr for x in ["Lave-vaisselle","Four","Hotte","Table","Machine café","Réfrig","Congél","Tiroir","MasterCool","Blizzard","Micro-ondes","CombiSet","Réfrigération"]):
            return "Cuisine"
        if any(x in cat_fr for x in ["Aspirateur","Duoflex","Triflex","Boost","Guard","Complete","Compact","Classic"]):
            return "Aspirateurs"
        return "Accessoires"

    crees = 0
    mis_a_jour = 0
    next_id = max_id + 1

    for p in products:
        out = _product_to_out(p)
        sku = (out.ref or "").strip()   # default_code Odoo
        if not sku:
            sku = f"odoo_{p['id']}"     # fallback pour les produits sans code interne
        categ = out.categorie or "Autre"
        parts = [x.strip() for x in categ.split("/")]
        cat_en = parts[-1]
        cat_fr = TRADUCTION_CAT.get(cat_en, cat_en)
        univers = _univers(cat_fr)

        if sku in existing_by_sku:
            ex = existing_by_sku[sku]
            ex["sku"] = sku
            ex["ref"] = out.nom          # nom Odoo = ref affiché sur le devis
            ex["u"] = univers
            ex["cat"] = cat_fr
            ex["des"] = out.description or ex.get("des", "")   # description_sale → champ description
            # fin (couleur/finition) est préservé tel quel
            ex["prix"] = out.prix
            mis_a_jour += 1
        else:
            entry = {
                "id": next_id,
                "sku": sku,
                "ref": out.nom,          # nom Odoo = ref affiché sur le devis
                "u": univers,
                "cat": cat_fr,
                "des": out.description or "",   # description_sale → champ description
                "fin": "",
                "prix": out.prix,
            }
            next_id += 1
            existing.append(entry)
            existing_by_sku[sku] = entry
            crees += 1

    # Réécrire le catalogue (dédupliqué par SKU)
    with open(_CATALOGUE_PATH, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    return SyncResult(crees=crees, mis_a_jour=mis_a_jour, total_odoo=len(products))
