"""
CRUD Devis + conversion vers Order Tracking.
"""
from __future__ import annotations
import re
from datetime import date, datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.devis import Devis, DevisLigne, Client, StatutDevis, TypeLigne, ActionLog
from app.auth.jwt import get_current_user, TokenData
from app.services.order_tracking import convert_devis_to_order


def _log(db: Session, utilisateur: str, action: str, reference: str | None = None, detail: str | None = None):
    db.add(ActionLog(utilisateur=utilisateur, action=action, module="DEVIS", reference=reference, detail=detail))
    db.flush()

router = APIRouter(prefix="/devis", tags=["devis"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class LigneIn(BaseModel):
    position: int = 0
    type: str = "produit"
    ref: Optional[str] = None
    description: Optional[str] = None
    finition: Optional[str] = None
    categorie: Optional[str] = None
    photo_filename: Optional[str] = None
    qty: float = 1
    prix_unitaire_ht: float = 0
    remise_ligne_pct: float = 0
    tva_taux: float = 20
    is_option: bool = False
    separateur_label: Optional[str] = None


class DevisIn(BaseModel):
    client_id: Optional[int] = None
    client_nom_libre: Optional[str] = None
    date_validite: Optional[date] = None
    remise_globale: float = 0
    remise_type: str = "pct"
    tva_taux: float = 20
    notes: Optional[str] = None
    conditions_generales: Optional[str] = None
    pourquoi_miele: Optional[str] = None
    delai_livraison: Optional[str] = None
    modalite_paiement: Optional[str] = None
    lignes: List[LigneIn] = []


class LigneOut(BaseModel):
    id: int
    position: int
    type: str
    ref: Optional[str]
    description: Optional[str]
    finition: Optional[str]
    categorie: Optional[str]
    photo_filename: Optional[str]
    qty: float
    prix_unitaire_ht: float
    remise_ligne_pct: float
    tva_taux: float
    is_option: bool
    separateur_label: Optional[str]
    montant_ht: float

    class Config:
        from_attributes = True


class ClientOut(BaseModel):
    id: int
    nom: str
    prenom: Optional[str]
    telephone: Optional[str]
    email: Optional[str]
    ville: Optional[str]

    class Config:
        from_attributes = True


class DevisOut(BaseModel):
    id: int
    numero: str
    statut: str
    client_id: Optional[int]
    client_nom_libre: Optional[str]
    client: Optional[ClientOut]
    commercial: Optional[str]
    date_creation: datetime
    date_validite: Optional[date]
    remise_globale: float
    remise_type: str
    montant_ht: float
    montant_remise: float
    montant_ttc: float
    tva_taux: float
    notes: Optional[str]
    conditions_generales: Optional[str]
    pourquoi_miele: Optional[str]
    delai_livraison: Optional[str]
    modalite_paiement: Optional[str]
    order_tracking_id: Optional[int]
    order_tracking_ref: Optional[str]
    lignes: List[LigneOut] = []

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _next_numero(db: Session) -> str:
    year = datetime.now().year
    last = db.scalar(
        select(Devis).where(Devis.numero.like(f"DEV-{year}-%")).order_by(Devis.id.desc())
    )
    if last:
        n = int(last.numero.split("-")[-1]) + 1
    else:
        n = 1
    return f"DEV-{year}-{n:04d}"


def _recalc(devis: Devis) -> None:
    """Recalcule les totaux du devis — TVA par ligne."""
    active = []
    for l in devis.lignes:
        if l.type in ("produit", "libre") and not l.is_option:
            base = float(l.qty) * float(l.prix_unitaire_ht)
            net = base * (1 - float(l.remise_ligne_pct) / 100)
            l.montant_ht = round(net, 2)
            active.append(l)
        else:
            l.montant_ht = 0

    ht = sum(float(l.montant_ht) for l in active)

    # Taux TVA moyen pondéré (pour conversion remise TTC → HT)
    if ht > 0:
        weighted_tva = sum(float(l.montant_ht) * float(l.tva_taux) for l in active) / ht
    else:
        weighted_tva = float(devis.tva_taux)

    if devis.remise_type == "pct":
        remise_ht = ht * float(devis.remise_globale) / 100
    else:
        # remise_globale saisie en TTC → convertir en HT via taux moyen
        remise_ht = float(devis.remise_globale) / (1 + weighted_tva / 100)

    ht_net = max(0, ht - remise_ht)
    ratio = ht_net / ht if ht > 0 else 0
    total_tva = sum(float(l.montant_ht) * ratio * float(l.tva_taux) / 100 for l in active)

    devis.montant_ht = round(ht, 2)
    devis.montant_remise = round(remise_ht, 2)
    devis.montant_ttc = round(ht_net + total_tva, 2)


def _load(db: Session, devis_id: int) -> Devis:
    d = db.scalar(
        select(Devis).where(Devis.id == devis_id)
        .options(selectinload(Devis.lignes), selectinload(Devis.client))
    )
    if not d:
        raise HTTPException(status_code=404, detail="Devis introuvable.")
    return d


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[DevisOut])
def list_devis(
    statut: Optional[str] = None,
    db: Session = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    q = select(Devis).options(selectinload(Devis.client)).order_by(Devis.id.desc())
    if statut:
        q = q.where(Devis.statut == statut)
    return db.scalars(q).all()


@router.post("", response_model=DevisOut, status_code=201)
def create_devis(
    payload: DevisIn,
    db: Session = Depends(get_db),
    current: TokenData = Depends(get_current_user),
):
    devis = Devis(
        numero=_next_numero(db),
        client_id=payload.client_id,
        client_nom_libre=payload.client_nom_libre,
        commercial=current.sub,
        date_validite=payload.date_validite,
        remise_globale=payload.remise_globale,
        remise_type=payload.remise_type,
        tva_taux=payload.tva_taux,
        notes=payload.notes,
        conditions_generales=payload.conditions_generales,
        pourquoi_miele=payload.pourquoi_miele,
        delai_livraison=payload.delai_livraison,
        modalite_paiement=payload.modalite_paiement,
    )
    db.add(devis)
    db.flush()

    for i, l in enumerate(payload.lignes):
        ligne = DevisLigne(devis_id=devis.id, position=i, **l.model_dump(exclude={"position"}))
        db.add(ligne)

    db.flush()
    db.refresh(devis)
    _recalc(devis)
    _log(db, current.sub, "CREATION_DEVIS", devis.numero,
         f"Client: {payload.client_nom_libre or payload.client_id} | Montant TTC: {devis.montant_ttc}")
    db.commit()
    db.refresh(devis)
    return _load(db, devis.id)


@router.get("/{devis_id}", response_model=DevisOut)
def get_devis(devis_id: int, db: Session = Depends(get_db), _: TokenData = Depends(get_current_user)):
    return _load(db, devis_id)


@router.patch("/{devis_id}", response_model=DevisOut)
def update_devis(
    devis_id: int,
    payload: DevisIn,
    db: Session = Depends(get_db),
    current: TokenData = Depends(get_current_user),
):
    devis = _load(db, devis_id)
    if "admin" not in current.roles and devis.commercial != current.sub:
        raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que vos propres devis.")
    if devis.statut == StatutDevis.converti:
        raise HTTPException(status_code=400, detail="Un devis converti ne peut plus être modifié.")

    devis.client_id = payload.client_id
    devis.client_nom_libre = payload.client_nom_libre
    devis.date_validite = payload.date_validite
    devis.remise_globale = payload.remise_globale
    devis.remise_type = payload.remise_type
    devis.tva_taux = payload.tva_taux
    devis.notes = payload.notes
    devis.conditions_generales = payload.conditions_generales
    devis.pourquoi_miele = payload.pourquoi_miele
    devis.delai_livraison = payload.delai_livraison
    devis.modalite_paiement = payload.modalite_paiement

    # Remplacer les lignes
    for l in list(devis.lignes):
        db.delete(l)
    db.flush()

    for i, l in enumerate(payload.lignes):
        ligne = DevisLigne(devis_id=devis.id, position=i, **l.model_dump(exclude={"position"}))
        db.add(ligne)

    db.flush()
    db.refresh(devis)
    _recalc(devis)
    db.commit()
    return _load(db, devis_id)


@router.patch("/{devis_id}/statut", response_model=DevisOut)
def update_statut(
    devis_id: int,
    statut: str,
    db: Session = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    devis = _load(db, devis_id)
    try:
        devis.statut = StatutDevis(statut)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Statut invalide : {statut}")
    db.commit()
    return _load(db, devis_id)


@router.post("/{devis_id}/convert", response_model=DevisOut)
def convert_to_order(
    devis_id: int,
    db: Session = Depends(get_db),
    current: TokenData = Depends(get_current_user),
):
    """Convertit le devis en commande dans Order Tracking."""
    devis = _load(db, devis_id)

    if devis.statut == StatutDevis.converti:
        raise HTTPException(status_code=400, detail="Ce devis a déjà été converti en commande.")
    if devis.montant_ttc <= 0:
        raise HTTPException(status_code=400, detail="Le devis doit avoir un montant > 0.")

    # Appel vers Order Tracking — on utilise le token JWT du user courant
    from fastapi import Request
    order = convert_devis_to_order(devis, _get_raw_token(current))

    devis.order_tracking_id = order["id"]
    devis.order_tracking_ref = order["reference"]
    devis.statut = StatutDevis.converti
    _log(db, current.sub, "CONVERSION_DEVIS", devis.numero,
         f"Converti en commande {order['reference']} | Client: {devis.client_nom_libre or (devis.client.nom if devis.client else '')} | Montant TTC: {devis.montant_ttc}")
    db.commit()
    return _load(db, devis_id)


def _get_raw_token(current: TokenData) -> str:
    """Re-encode un token minimal pour appeler Order Tracking."""
    from app.auth.jwt import create_access_token
    return create_access_token(sub=current.sub, roles=current.roles)


@router.delete("/{devis_id}", status_code=204)
def delete_devis(devis_id: int, db: Session = Depends(get_db), current: TokenData = Depends(get_current_user)):
    devis = _load(db, devis_id)
    if "admin" not in current.roles and devis.commercial != current.sub:
        raise HTTPException(status_code=403, detail="Vous ne pouvez supprimer que vos propres devis.")
    if devis.statut == StatutDevis.converti:
        raise HTTPException(status_code=400, detail="Impossible de supprimer un devis converti.")
    _log(db, current.sub, "SUPPRESSION_DEVIS", devis.numero,
         f"Statut: {devis.statut} | Montant TTC: {devis.montant_ttc}")
    db.delete(devis)
    db.commit()


@router.get("/{devis_id}/pdf")
def get_devis_pdf(
    devis_id: int,
    db: Session = Depends(get_db),
    _: TokenData = Depends(get_current_user),
):
    """Génère et retourne le PDF du devis."""
    from app.documents.pdf_generator import generate_devis_pdf
    devis = _load(db, devis_id)
    try:
        pdf_bytes = generate_devis_pdf(devis, devis.lignes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur génération PDF : {e}")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{devis.numero}.pdf"'},
    )
