"""
Génération PDF avec WeasyPrint — Devis Commercial
"""
from __future__ import annotations
import io
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

from app.config import get_settings

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_IMG_DIR = Path(__file__).parent.parent / "catalogue_images"
_STATIC_DIR = Path(__file__).parent / "static"

settings = get_settings()

jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
)


def _mad(value) -> str:
    if value is None:
        return "0,00 MAD"
    return f"{float(value):,.2f} MAD".replace(",", " ").replace(".", ",").replace(" ", "\u202f")


def _fmt_date(value) -> str:
    if value is None:
        return "—"
    if isinstance(value, str):
        return value
    try:
        return value.strftime("%d/%m/%Y")
    except Exception:
        return str(value)


jinja_env.filters["mad"] = _mad
jinja_env.filters["date"] = _fmt_date


def _company_ctx() -> dict:
    return {
        "company_name": getattr(settings, "company_name", "PRIME HOME SARL"),
        "company_capital": getattr(settings, "company_capital", "300 000 DH"),
        "company_address": getattr(settings, "company_address", "413, Route Al Jamiaa (ex Route Eljadida), Oasis Casablanca"),
        "company_tel": getattr(settings, "company_tel", "+212 522 254 732"),
        "company_email": getattr(settings, "company_email", "contact@prime-home.ma"),
        "company_website": getattr(settings, "company_website", "https://www.miele.co.ma"),
        "company_rc": getattr(settings, "company_rc", "591297"),
        "company_ice": getattr(settings, "company_ice", "003278319000021"),
        "company_if": getattr(settings, "company_if", "53752089"),
        "date_impression": datetime.now().strftime("%d/%m/%Y à %H:%M"),
    }


def generate_devis_pdf(devis, lignes_db: list) -> bytes:
    """
    Génère le PDF d'un devis commercial.
    Retourne les bytes du PDF.
    """
    # Préparer les lignes avec chemins d'images absolus
    lignes = []
    for l in lignes_db:
        image_path = None
        if l.photo_filename:
            candidate = _IMG_DIR / l.photo_filename
            if candidate.exists():
                image_path = str(candidate)
        lignes.append({
            "type": l.type,
            "ref": l.ref,
            "description": l.description,
            "finition": l.finition,
            "qty": l.qty,
            "prix_unitaire_ht": l.prix_unitaire_ht,
            "remise_ligne_pct": l.remise_ligne_pct,
            "tva_taux": float(l.tva_taux) if l.tva_taux is not None else 20.0,
            "montant_ht": l.montant_ht,
            "is_option": l.is_option,
            "separateur_label": l.separateur_label,
            "image_path": image_path,
        })

    # Client
    client = devis.client
    client_nom = (
        (client.nom + (" " + client.prenom if client.prenom else ""))
        if client else (devis.client_nom_libre or "Client")
    )

    ctx = {
        **_company_ctx(),
        "devis": devis,
        "client": client or _EmptyClient(),
        "client_nom": client_nom,
        "lignes": lignes,
        "conditions_generales": devis.conditions_generales or "",
        "pourquoi_miele": devis.pourquoi_miele or "",
        "delai_livraison": getattr(devis, "delai_livraison", None) or "",
        "modalite_paiement": getattr(devis, "modalite_paiement", None) or "",
    }

    template = jinja_env.get_template("devis.html")
    html_str = template.render(**ctx)

    # base_url = dossier templates pour résoudre logo_primehome.png
    pdf_bytes = HTML(string=html_str, base_url=str(_TEMPLATES_DIR)).write_pdf()
    return pdf_bytes


class _EmptyClient:
    telephone = None
    email = None
    adresse = None
    ville = None
    ice = None
    prenom = None
