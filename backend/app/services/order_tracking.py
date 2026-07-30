"""
Client HTTP vers l'API Order Tracking (miele_erp).
Utilisé pour convertir un devis en commande.
"""
from __future__ import annotations
import httpx
from fastapi import HTTPException
from app.config import get_settings
from app.models.devis import Devis

settings = get_settings()


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def convert_devis_to_order(devis: Devis, user_token: str) -> dict:
    """
    Crée une commande dans Order Tracking à partir d'un devis accepté.
    Retourne {id, reference} de la commande créée.
    """
    client_name = (
        devis.client.nom if devis.client
        else devis.client_nom_libre or "Client inconnu"
    )

    # Construire les lignes (uniquement les produits, pas les séparateurs)
    lines = []
    for l in devis.lignes:
        if l.type == "produit" or l.type == "libre":
            desc = l.description or l.ref or "Produit"
            if l.ref and l.description:
                desc = f"[{l.ref}] {l.description}"
            elif l.ref:
                desc = f"[{l.ref}]"
            lines.append({
                "product_name": desc,
                "qty_ordered": float(l.qty),
                "unit_price": float(l.prix_unitaire_ht),
            })

    payload = {
        "client": client_name,
        "order_date": devis.date_creation.isoformat(),
        "amount_total": float(devis.montant_ttc),
        "source": "manuel",
        "reference": None,
        "lines": lines,
    }

    url = f"{settings.order_tracking_url}/orders"
    try:
        resp = httpx.post(url, json=payload, headers=_headers(user_token), timeout=15)
        if resp.status_code == 409:
            raise HTTPException(status_code=409, detail="Référence déjà utilisée dans Order Tracking.")
        if resp.status_code not in (200, 201):
            raise HTTPException(
                status_code=502,
                detail=f"Order Tracking a retourné {resp.status_code}: {resp.text[:200]}"
            )
        return resp.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Impossible de joindre Order Tracking : {e}")
