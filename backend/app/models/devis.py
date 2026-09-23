from __future__ import annotations
import enum
from datetime import datetime, date
from sqlalchemy import BigInteger, String, Numeric, DateTime, Date, Enum as SAEnum
from sqlalchemy import ForeignKey, Integer, Boolean, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class StatutDevis(str, enum.Enum):
    brouillon = "brouillon"
    envoye = "envoye"
    accepte = "accepte"
    refuse = "refuse"
    converti = "converti"   # passé en Order Tracking
    expire = "expire"


class TypeLigne(str, enum.Enum):
    produit = "produit"
    separateur = "separateur"
    libre = "libre"


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nom: Mapped[str] = mapped_column(String(200), nullable=False)
    prenom: Mapped[str | None] = mapped_column(String(100), nullable=True)
    telephone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    adresse: Mapped[str | None] = mapped_column(Text, nullable=True)
    ville: Mapped[str | None] = mapped_column(String(100), nullable=True, default="Casablanca")
    ice: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    devis: Mapped[list["Devis"]] = relationship("Devis", back_populates="client")


class Devis(Base):
    __tablename__ = "devis"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    numero: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    statut: Mapped[StatutDevis] = mapped_column(
        SAEnum(StatutDevis, name="statut_devis"), nullable=False, default=StatutDevis.brouillon
    )

    client_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("clients.id"), nullable=True)
    client_nom_libre: Mapped[str | None] = mapped_column(String(200), nullable=True)  # si pas de client en base

    commercial: Mapped[str | None] = mapped_column(String(100), nullable=True)
    date_creation: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    date_validite: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Remise globale
    remise_globale: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    remise_type: Mapped[str] = mapped_column(String(10), nullable=False, default="pct")  # "pct" | "montant"

    # Totaux calculés
    montant_ht: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    montant_remise: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    montant_ttc: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    tva_taux: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=20)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    conditions_generales: Mapped[str | None] = mapped_column(Text, nullable=True)
    pourquoi_miele: Mapped[str | None] = mapped_column(Text, nullable=True)
    delai_livraison: Mapped[str | None] = mapped_column(Text, nullable=True)
    modalite_paiement: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Lien vers Order Tracking après conversion
    order_tracking_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    order_tracking_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    client: Mapped[Client | None] = relationship("Client", back_populates="devis")
    lignes: Mapped[list["DevisLigne"]] = relationship(
        "DevisLigne", back_populates="devis", cascade="all, delete-orphan", order_by="DevisLigne.position"
    )


class DevisLigne(Base):
    __tablename__ = "devis_lignes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    devis_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("devis.id", ondelete="CASCADE"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    type: Mapped[TypeLigne] = mapped_column(
        SAEnum(TypeLigne, name="type_ligne"), nullable=False, default=TypeLigne.produit
    )

    # Champs produit / libre
    ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    finition: Mapped[str | None] = mapped_column(String(100), nullable=True)
    categorie: Mapped[str | None] = mapped_column(String(100), nullable=True)
    photo_filename: Mapped[str | None] = mapped_column(String(300), nullable=True)

    qty: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False, default=1)
    prix_unitaire_ht: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    remise_ligne_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    tva_taux: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=20)
    is_option: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Champs séparateur
    separateur_label: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Calculé
    montant_ht: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    devis: Mapped["Devis"] = relationship("Devis", back_populates="lignes")



class ActionLog(Base):
    """Journal des actions importantes (visible par l'admin)."""
    __tablename__ = "action_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    horodatage: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    utilisateur: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    module: Mapped[str] = mapped_column(String(50), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)


class User(Base):
    """Utilisateurs de l'application Devis."""
    __tablename__ = "devis_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    roles: Mapped[str] = mapped_column(String(200), nullable=False, default="commercial")
    actif: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
