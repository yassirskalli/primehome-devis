export interface Client {
  id: number
  nom: string
  prenom?: string
  telephone?: string
  email?: string
  adresse?: string
  ville?: string
  ice?: string
}

export interface Ligne {
  id?: number
  position: number
  type: 'produit' | 'separateur' | 'libre'
  ref?: string
  description?: string
  finition?: string
  categorie?: string
  photo_filename?: string
  qty: number
  prix_unitaire_ht: number
  remise_ligne_pct: number
  tva_taux: number
  is_option: boolean
  separateur_label?: string
  montant_ht: number
}

export interface Devis {
  id: number
  numero: string
  statut: 'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'converti' | 'expire'
  client_id?: number
  client_nom_libre?: string
  client?: Client
  commercial?: string
  date_creation: string
  date_validite?: string
  remise_globale: number
  remise_type: 'pct' | 'montant'
  montant_ht: number
  montant_remise: number
  montant_ttc: number
  tva_taux: number
  notes?: string
  conditions_generales?: string
  pourquoi_miele?: string
  delai_livraison?: string
  modalite_paiement?: string
  order_tracking_id?: number
  order_tracking_ref?: string
  lignes: Ligne[]
}

export interface CatalogueProduit {
  id: number
  sku?: string
  ref: string
  u: string
  cat: string
  des: string
  fin: string
  prix: number
  image?: string
}
