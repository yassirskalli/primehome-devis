"""
Client Odoo (lecture seule) pour le module Devis.
Connexion lazy via odoorpc, partagée sur tout le process.
"""
from __future__ import annotations
import logging
from urllib.parse import urlparse

import odoorpc

from app.config import get_settings

logger = logging.getLogger(__name__)
_odoo_instance: odoorpc.ODOO | None = None


def _parse_host_port(url: str) -> tuple[str, int, str]:
    p = urlparse(url)
    protocol = "jsonrpc+ssl" if p.scheme == "https" else "jsonrpc"
    host = p.hostname or "odoo18_app"
    port = p.port or (443 if p.scheme == "https" else 8069)
    return host, port, protocol


def get_odoo() -> odoorpc.ODOO:
    global _odoo_instance
    if _odoo_instance is None:
        s = get_settings()
        host, port, protocol = _parse_host_port(s.odoo_url)
        odoo = odoorpc.ODOO(host, protocol=protocol, port=port)
        odoo.login(s.odoo_db, s.odoo_user, s.odoo_password)
        _odoo_instance = odoo
        logger.info("Devis connecté à Odoo %s", s.odoo_url)
    return _odoo_instance


def reset_connection() -> None:
    global _odoo_instance
    _odoo_instance = None


def call(model: str, method: str, args: list, kwargs: dict | None = None) -> object:
    kwargs = kwargs or {}
    try:
        return get_odoo().execute_kw(model, method, args, kwargs)
    except Exception as exc:
        if "session" in str(exc).lower() or "login" in str(exc).lower():
            reset_connection()
            return get_odoo().execute_kw(model, method, args, kwargs)
        raise


# ---------------------------------------------------------------------------
# Clients (res.partner)
# ---------------------------------------------------------------------------

def search_partners(q: str, limit: int = 20) -> list[dict]:
    """Recherche temps réel dans les partenaires Odoo (autocomplete)."""
    domain = [
        ["customer_rank", ">", 0],
        ["active", "=", True],
        "|", ["name", "ilike", q], ["phone", "ilike", q],
    ]
    records = call(
        "res.partner", "search_read",
        [domain],
        {
            "fields": ["id", "name", "phone", "mobile", "email", "street", "city", "ref", "vat"],
            "limit": limit,
            "order": "name asc",
        },
    )
    return records  # type: ignore


def get_all_partners(limit: int = 2000) -> list[dict]:
    """Récupère tous les partenaires clients pour une sync complète."""
    domain = [["customer_rank", ">", 0], ["active", "=", True]]
    records = call(
        "res.partner", "search_read",
        [domain],
        {
            "fields": ["id", "name", "phone", "mobile", "email", "street", "city", "ref", "vat"],
            "limit": limit,
            "order": "name asc",
        },
    )
    return records  # type: ignore


# ---------------------------------------------------------------------------
# Produits (product.template)
# ---------------------------------------------------------------------------

def search_products(q: str, limit: int = 30) -> list[dict]:
    """Recherche temps réel dans les produits Odoo vendables."""
    domain = [
        ["sale_ok", "=", True],
        ["active", "=", True],
        "|", ["name", "ilike", q], ["default_code", "ilike", q],
    ]
    records = call(
        "product.template", "search_read",
        [domain],
        {
            "fields": ["id", "name", "default_code", "list_price", "categ_id", "description_sale"],
            "limit": limit,
            "order": "name asc",
        },
    )
    return records  # type: ignore


def get_sale_orders(limit: int = 200, state: str | None = None) -> list[dict]:
    """Récupère les devis/commandes Odoo (sale.order)."""
    domain: list = []
    if state:
        domain.append(["state", "=", state])
    else:
        domain.append(["state", "in", ["draft", "sent", "sale", "done"]])
    records = call(
        "sale.order", "search_read",
        [domain],
        {
            "fields": ["id", "name", "partner_id", "date_order", "amount_total",
                       "state", "user_id", "validity_date"],
            "limit": limit,
            "order": "date_order desc",
        },
    )
    return records  # type: ignore


def get_sale_order_pdf(odoo_id: int) -> bytes:
    """Télécharge le PDF du devis Odoo via session HTTP."""
    import httpx
    from app.config import get_settings
    s = get_settings()
    with httpx.Client(base_url=s.odoo_url, timeout=30) as client:
        auth = client.post("/web/session/authenticate", json={
            "jsonrpc": "2.0", "method": "call", "id": 1,
            "params": {"db": s.odoo_db, "login": s.odoo_user, "password": s.odoo_password},
        })
        if auth.status_code != 200:
            raise Exception("Authentification Odoo échouée")
        pdf = client.get(
            f"/report/pdf/sale.report_saleorder/{odoo_id}",
            cookies=auth.cookies,
        )
        if pdf.status_code != 200:
            raise Exception(f"PDF non disponible (status {pdf.status_code})")
        return pdf.content


def get_all_products(limit: int = 5000) -> list[dict]:
    """Récupère tous les produits vendables pour une sync complète."""
    domain = [["sale_ok", "=", True], ["active", "=", True]]
    records = call(
        "product.template", "search_read",
        [domain],
        {
            "fields": ["id", "name", "default_code", "list_price", "categ_id", "description_sale"],
            "limit": limit,
            "order": "name asc",
        },
    )
    return records  # type: ignore
