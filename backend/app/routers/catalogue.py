import json, os, shutil
from typing import Optional, List
from pathlib import Path
from fastapi import APIRouter, Query, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from app.auth.jwt import get_current_user, TokenData

router = APIRouter(prefix="/catalogue", tags=["catalogue"])

_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "catalogue_data.json")
_IMG_DIR = Path(os.path.dirname(__file__)).parent / "catalogue_images"
_IMG_DIR.mkdir(exist_ok=True)

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def _load() -> list[dict]:
    with open(_DATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save(data: list[dict]) -> None:
    with open(_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class Produit(BaseModel):
    id: int
    sku: Optional[str] = None
    ref: str
    u: str
    cat: str
    des: str
    fin: str
    prix: float
    image: Optional[str] = None


@router.get("", response_model=List[Produit])
def search_catalogue(
    q: Optional[str] = Query(default=None),
    cat: Optional[str] = Query(default=None),
    u: Optional[str] = Query(default=None),
):
    results = _load()
    if q:
        q_lower = q.lower()
        results = [p for p in results if q_lower in (p.get("ref") or "").lower() or q_lower in (p.get("des") or "").lower()]
    if cat:
        results = [p for p in results if p.get("cat") == cat]
    if u:
        results = [p for p in results if p.get("u") == u]
    return [
        Produit(
            id=p["id"], ref=p.get("ref", ""), u=p.get("u", ""),
            cat=p.get("cat", ""), des=p.get("des", ""), fin=p.get("fin", ""),
            prix=p.get("prix", 0), image=p.get("image"),
        )
        for p in results
    ]


@router.get("/categories")
def get_categories():
    data = _load()
    cats = sorted(set(p["cat"] for p in data if p.get("cat")))
    univers = sorted(set(p["u"] for p in data if p.get("u")))
    return {"categories": cats, "univers": univers}


@router.post("/{produit_id}/image")
async def upload_image(
    produit_id: int,
    file: UploadFile = File(...),
    _: TokenData = Depends(get_current_user),
):
    """Upload une image pour un produit du catalogue."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Extension non autorisée. Acceptées : {', '.join(ALLOWED_EXT)}")

    data = _load()
    produit = next((p for p in data if p["id"] == produit_id), None)
    if not produit:
        raise HTTPException(404, "Produit introuvable")

    # Supprimer l'ancienne image si elle existe
    if produit.get("image"):
        old = _IMG_DIR / produit["image"]
        if old.exists():
            old.unlink()

    filename = f"prod_{produit_id}{ext}"
    dest = _IMG_DIR / filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    produit["image"] = filename
    _save(data)
    return {"image": filename}


@router.delete("/{produit_id}/image", status_code=204)
def delete_image(produit_id: int, _: TokenData = Depends(get_current_user)):
    """Supprime l'image d'un produit."""
    data = _load()
    produit = next((p for p in data if p["id"] == produit_id), None)
    if not produit:
        raise HTTPException(404, "Produit introuvable")
    if produit.get("image"):
        img = _IMG_DIR / produit["image"]
        if img.exists():
            img.unlink()
        produit.pop("image", None)
        _save(data)


@router.get("/images/{filename}")
def get_image(filename: str):
    """Sert une image de produit."""
    path = _IMG_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(404, "Image introuvable")
    return FileResponse(str(path))
