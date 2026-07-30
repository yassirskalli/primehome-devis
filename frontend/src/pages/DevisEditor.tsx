import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCatalogue, getCatalogueCategories, getClients, createDevis,
  updateDevis, getDevisById, updateStatut, convertToOrder,
  searchOdooClients, createClient, syncOdooProduits, uploadProduitImage,
  deleteProduitImage, downloadDevisPdf,
} from '../lib/api'
import { getUser } from '../lib/auth'
import type { Devis, Ligne, CatalogueProduit, Client } from '../types'
import {
  Plus, Trash2, Search, AlertTriangle,
  ExternalLink, ShoppingCart, Minus, PlusCircle, RefreshCw,
  FileText, ImagePlus, X, Check,
} from 'lucide-react'

const DEFAULT_CONDITIONS = `✔ La Remise est valable jusqu'au ___________
✔ Devis indivisible : toute modification entraîne révision du prix et de la remise.
✔ Garantie : 24 mois sur tous les produits Miele`

const DEFAULT_DELAI = `7 à 8 semaines à partir de la confirmation de la commande`
const DEFAULT_MODALITE = `80% à la commande, 20% à la livraison`

const DEFAULT_POURQUOI = `✔ Qualité Allemande : Fabrication premium pour une durabilité exceptionnelle.
✔ Technologie Innovante : Performance et efficacité énergétique avancées.
✔ Design Élégant : Des appareils qui s'intègrent parfaitement à votre intérieur.
✔ Service Exclusif : Accompagnement personnalisé et garantie premium.

Nous restons à votre disposition pour toute précision et serions ravis de vous accompagner dans ce projet.`

const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DH'
const fmtHT = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUT_COLOR: Record<string, string> = {
  brouillon: 'bg-gray-100 text-gray-600', envoye: 'bg-blue-100 text-blue-700',
  accepte: 'bg-green-100 text-green-700', refuse: 'bg-red-100 text-red-700',
  converti: 'bg-purple-100 text-purple-700', expire: 'bg-orange-100 text-orange-700',
}
const STATUT_LABEL: Record<string, string> = {
  brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté',
  refuse: 'Refusé', converti: 'Converti', expire: 'Expiré',
}

function calcLigne(l: Ligne): number {
  if (l.type !== 'produit' && l.type !== 'libre') return 0
  if (l.is_option) return 0
  const base = l.qty * l.prix_unitaire_ht
  return base * (1 - l.remise_ligne_pct / 100)
}

function calcTotaux(lignes: Ligne[], remise_globale: number, remise_type: string, default_tva: number) {
  const active = lignes.filter(l => (l.type === 'produit' || l.type === 'libre') && !l.is_option)
  const ht = active.reduce((s, l) => s + calcLigne(l), 0)

  // Taux TVA moyen pondéré
  const weightedTva = ht > 0
    ? active.reduce((s, l) => s + calcLigne(l) * (l.tva_taux ?? default_tva), 0) / ht
    : default_tva

  let remise_ht: number, remise_ttc: number
  if (remise_type === 'pct') {
    remise_ht = ht * remise_globale / 100
    remise_ttc = remise_ht * (1 + weightedTva / 100)
  } else {
    remise_ttc = remise_globale
    remise_ht = remise_globale / (1 + weightedTva / 100)
  }

  const htNet = Math.max(0, ht - remise_ht)
  const ratio = ht > 0 ? htNet / ht : 0
  const tva = active.reduce((s, l) => s + calcLigne(l) * ratio * (l.tva_taux ?? default_tva) / 100, 0)
  return { ht, remise: remise_ht, remiseTTC: remise_ttc, htNet, tva, ttc: htNet + tva }
}

// ── Autocomplete client (Odoo + local) ──────────────────────────────────────
function ClientAutocomplete({
  clientId, clientNomLibre, disabled,
  onSelect, onLibre,
}: {
  clientId: number | null
  clientNomLibre: string
  disabled: boolean
  onSelect: (id: number, nom: string) => void
  onLibre: (nom: string) => void
}) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const { data: localClients = [] } = useQuery<Client[]>({ queryKey: ['clients'], queryFn: () => getClients() })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Initialiser le label depuis clientId ou clientNomLibre
  useEffect(() => {
    if (clientId) {
      const c = localClients.find(c => c.id === clientId)
      if (c) setInput(c.nom + (c.prenom ? ' ' + c.prenom : ''))
    } else if (clientNomLibre) {
      setInput(clientNomLibre)
    }
  }, [clientId, clientNomLibre, localClients])

  // Fermer sur clic extérieur
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleChange(val: string) {
    setInput(val)
    onLibre(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.length < 2) { setSuggestions([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        // Local d'abord
        const local = localClients.filter(c =>
          (c.nom + ' ' + (c.prenom ?? '')).toLowerCase().includes(val.toLowerCase()) ||
          (c.telephone ?? '').includes(val)
        ).slice(0, 5).map(c => ({ source: 'local', id: c.id, nom: c.nom, prenom: c.prenom, telephone: c.telephone, email: c.email }))
        // Odoo ensuite
        let odoo: any[] = []
        try {
          const res = await searchOdooClients(val)
          odoo = res.map((p: any) => ({ source: 'odoo', odoo_id: p.odoo_id, nom: p.nom, telephone: p.telephone, email: p.email, adresse: p.adresse, ville: p.ville, ice: p.ice }))
        } catch { /* Odoo indisponible */ }
        // Dédupliquer : masquer odoo si nom déjà en local
        const localNoms = new Set(local.map((c: any) => c.nom.toLowerCase()))
        const filtered = odoo.filter((o: any) => !localNoms.has(o.nom.toLowerCase()))
        setSuggestions([...local, ...filtered])
        setOpen(true)
      } finally { setLoading(false) }
    }, 300)
  }

  async function selectSuggestion(s: any) {
    setOpen(false)
    if (s.source === 'local') {
      setInput(s.nom + (s.prenom ? ' ' + s.prenom : ''))
      onSelect(s.id, s.nom)
    } else {
      // Client Odoo → créer en local si pas encore présent
      try {
        const created = await createClient({ nom: s.nom, telephone: s.telephone, email: s.email, adresse: s.adresse, ville: s.ville || 'Casablanca', ice: s.ice })
        setInput(created.nom)
        onSelect(created.id, created.nom)
      } catch {
        setInput(s.nom)
        onLibre(s.nom)
      }
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
        <input
          value={input}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => input.length >= 2 && suggestions.length > 0 && setOpen(true)}
          disabled={disabled}
          placeholder="Rechercher un client (Odoo ou local)…"
          className="w-full pl-8 pr-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
        />
        {loading && <RefreshCw className="absolute right-2.5 top-2 w-3.5 h-3.5 text-gray-400 animate-spin" />}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button key={i} onMouseDown={() => selectSuggestion(s)}
              className="w-full text-left px-3 py-2 hover:bg-red-50 border-b border-gray-50 last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">{s.nom}{s.prenom ? ' ' + s.prenom : ''}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${s.source === 'odoo' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.source === 'odoo' ? 'Odoo' : 'Local'}
                </span>
              </div>
              {s.telephone && <div className="text-xs text-gray-400">{s.telephone}</div>}
              {s.email && <div className="text-xs text-gray-400">{s.email}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DevisEditorPage() {
  const { id } = useParams<{ id?: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: existing } = useQuery<Devis>({
    queryKey: ['devis', id],
    queryFn: () => getDevisById(Number(id)),
    enabled: !isNew,
  })

  const { data: categories } = useQuery({ queryKey: ['cat-categories'], queryFn: getCatalogueCategories })

  // Form state
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [clientId, setClientId] = useState<number | null>(null)
  const [clientNomLibre, setClientNomLibre] = useState('')
  const [dateValidite, setDateValidite] = useState('')
  const [remiseGlobale, setRemiseGlobale] = useState(0)
  const [remiseType, setRemiseType] = useState<'pct' | 'montant'>('pct')
  const [notes, setNotes] = useState('')
  const [tva, setTva] = useState(20)
  const [conditions, setConditions] = useState(DEFAULT_CONDITIONS)
  const [pourquoi, setPourquoi] = useState(DEFAULT_POURQUOI)
  const [delaiLivraison, setDelaiLivraison] = useState(DEFAULT_DELAI)
  const [modalitePaiement, setModalitePaiement] = useState(DEFAULT_MODALITE)
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)

  // Catalogue sidebar
  const [catSearch, setCatSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [showCat, setShowCat] = useState(true)
  const [syncingOdoo, setSyncingOdoo] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [uploadingForId, setUploadingForId] = useState<number | null>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const API_BASE = import.meta.env.VITE_API_BASE ?? '/devis/api'

  const { data: catalogueData = [] } = useQuery<CatalogueProduit[]>({
    queryKey: ['catalogue', catSearch, catFilter],
    queryFn: () => getCatalogue(catSearch || undefined, catFilter || undefined),
  })

  useEffect(() => {
    if (existing) {
      setLignes(existing.lignes.map(l => ({ ...l })))
      setClientId(existing.client_id ?? null)
      setClientNomLibre(existing.client_nom_libre ?? '')
      setDateValidite(existing.date_validite ?? '')
      setRemiseGlobale(existing.remise_globale)
      setRemiseType(existing.remise_type as 'pct' | 'montant')
      setNotes(existing.notes ?? '')
      setTva(existing.tva_taux)
      setConditions(existing.conditions_generales ?? DEFAULT_CONDITIONS)
      setPourquoi(existing.pourquoi_miele ?? DEFAULT_POURQUOI)
      setDelaiLivraison(existing.delai_livraison ?? DEFAULT_DELAI)
      setModalitePaiement(existing.modalite_paiement ?? DEFAULT_MODALITE)
    }
  }, [existing])

  const totaux = calcTotaux(lignes, remiseGlobale, remiseType, tva)
  const isConverti = existing?.statut === 'converti'

  function addFromCatalogue(p: CatalogueProduit) {
    setLignes(prev => [...prev, {
      position: prev.length,
      type: 'produit',
      ref: p.ref,
      description: p.des,
      finition: p.fin !== '-' ? p.fin : undefined,
      categorie: p.cat,
      photo_filename: p.image ?? undefined,
      qty: 1,
      prix_unitaire_ht: p.prix,
      remise_ligne_pct: 0,
      tva_taux: tva,
      is_option: false,
      montant_ht: p.prix,
    }])
  }

  function addSeparateur() {
    setLignes(prev => [...prev, {
      position: prev.length, type: 'separateur',
      ref: undefined, description: undefined, finition: undefined,
      categorie: undefined, qty: 1, prix_unitaire_ht: 0,
      remise_ligne_pct: 0, is_option: false, montant_ht: 0,
      separateur_label: 'SECTION',
    }])
  }

  function addLibre() {
    setLignes(prev => [...prev, {
      position: prev.length, type: 'libre',
      ref: 'Réf.', description: 'Description',
      qty: 1, prix_unitaire_ht: 0, remise_ligne_pct: 0, tva_taux: tva,
      is_option: false, montant_ht: 0,
    }])
  }

  function delLigne(i: number) { setLignes(prev => prev.filter((_, idx) => idx !== i)) }

  function updateLigne(i: number, patch: Partial<Ligne>) {
    setLignes(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }

  function buildPayload() {
    return {
      client_id: clientId,
      client_nom_libre: clientNomLibre || undefined,
      date_validite: dateValidite || undefined,
      remise_globale: remiseGlobale,
      remise_type: remiseType,
      tva_taux: tva,
      notes: notes || undefined,
      conditions_generales: conditions,
      pourquoi_miele: pourquoi,
      delai_livraison: delaiLivraison,
      modalite_paiement: modalitePaiement,
      lignes: lignes.map((l, i) => ({ ...l, position: i })),
    }
  }

  async function save() {
    setSaving(true)
    try {
      const payload = buildPayload()
      let saved: Devis
      if (isNew) {
        saved = await createDevis(payload)
        navigate(`/devis/${saved.id}`, { replace: true })
      } else {
        saved = await updateDevis(Number(id), payload)
        qc.invalidateQueries({ queryKey: ['devis', id] })
      }
      qc.invalidateQueries({ queryKey: ['devis'] })
    } finally {
      setSaving(false)
    }
  }

  async function doConvert() {
    if (!window.confirm('Convertir ce devis en commande dans Order Tracking ?')) return
    setConverting(true); setConvertError('')
    try {
      const updated: Devis = await convertToOrder(Number(id))
      qc.invalidateQueries({ queryKey: ['devis'] })
      qc.setQueryData(['devis', id], updated)
    } catch (e: any) {
      setConvertError(e.response?.data?.detail ?? 'Erreur lors de la conversion.')
    } finally {
      setConverting(false)
    }
  }

  const clientName = clientNomLibre || String(clientId ?? '')

  return (
    <div className="flex h-full">
      {/* Catalogue sidebar */}
      {/* Hidden file input for image upload */}
      <input ref={imgInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
        onChange={async e => {
          const file = e.target.files?.[0]
          if (!file || uploadingForId === null) return
          try {
            await uploadProduitImage(uploadingForId, file)
            qc.invalidateQueries({ queryKey: ['catalogue'] })
          } catch { /* silent */ } finally {
            setUploadingForId(null)
            if (imgInputRef.current) imgInputRef.current.value = ''
          }
        }}
      />

      {showCat && (
        <div className="w-72 border-r bg-white flex flex-col shrink-0 overflow-hidden">
          <div className="px-3 py-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Catalogue</div>
              <button
                onClick={async () => {
                  setSyncingOdoo(true); setSyncResult(null)
                  try {
                    const res = await syncOdooProduits()
                    setSyncResult(`+${res.created ?? 0} ajoutés, ${res.updated ?? 0} mis à jour`)
                    qc.invalidateQueries({ queryKey: ['catalogue'] })
                    qc.invalidateQueries({ queryKey: ['cat-categories'] })
                    setTimeout(() => setSyncResult(null), 4000)
                  } catch { setSyncResult('Erreur sync Odoo') }
                  finally { setSyncingOdoo(false) }
                }}
                disabled={syncingOdoo}
                title="Synchroniser les produits depuis Odoo"
                className="flex items-center gap-1 text-xs border rounded px-2 py-1 text-blue-600 hover:bg-blue-50 disabled:opacity-50">
                <RefreshCw className={`w-3 h-3 ${syncingOdoo ? 'animate-spin' : ''}`} />
                Odoo
              </button>
            </div>
            {syncResult && (
              <div className={`text-xs px-2 py-1 rounded mb-2 flex items-center gap-1 ${syncResult.startsWith('Erreur') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                {!syncResult.startsWith('Erreur') && <Check className="w-3 h-3" />}
                {syncResult}
              </div>
            )}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
              <input value={catSearch} onChange={e => setCatSearch(e.target.value)}
                placeholder="Rechercher…" className="w-full pl-8 pr-3 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-500">
              <option value="">Toutes catégories</option>
              {(categories?.categories ?? []).map((c: string) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto">
            {catalogueData.map((p) => (
              <div key={p.id} className="border-b border-gray-50 flex items-center gap-2 hover:bg-red-50 group transition-colors px-3 py-2">
                {/* Image thumbnail or placeholder */}
                <div className="w-10 h-10 shrink-0 rounded overflow-hidden border bg-gray-50 flex items-center justify-center">
                  {p.image
                    ? <img src={`${API_BASE}/catalogue/images/${p.image}`} alt="" className="w-full h-full object-cover" />
                    : <span className="text-gray-300 text-xs">IMG</span>
                  }
                </div>
                {/* Info + add */}
                <button onClick={() => !isConverti && addFromCatalogue(p)} disabled={isConverti}
                  className="flex-1 min-w-0 text-left disabled:opacity-40">
                  <div className="text-xs font-semibold text-gray-800 truncate">{p.ref}</div>
                  {p.sku && <div className="text-xs text-gray-400 truncate">{p.sku}</div>}
                  <div className="text-xs font-bold text-red-700">{p.prix.toLocaleString('fr-FR')} DH HT</div>
                </button>
                {/* Upload image button */}
                <button
                  onClick={e => { e.stopPropagation(); setUploadingForId(p.id); imgInputRef.current?.click() }}
                  title="Ajouter une image"
                  className="shrink-0 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ImagePlus className="w-4 h-4" />
                </button>
                {/* Add to devis button */}
                {!isConverti && (
                  <button onClick={() => addFromCatalogue(p)}
                    className="shrink-0 text-gray-300 group-hover:text-red-700 transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <div className="bg-white border-b px-5 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowCat(v => !v)} className="text-xs border rounded px-2 py-1 text-gray-500 hover:bg-gray-50">
              {showCat ? '◀ Catalogue' : '▶ Catalogue'}
            </button>
            <span className="text-sm font-bold text-gray-900">
              {isNew ? 'Nouveau devis' : existing?.numero}
            </span>
            {existing && (
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUT_COLOR[existing.statut]}`}>
                {STATUT_LABEL[existing.statut]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isNew && !isConverti && (
              <select
                onChange={e => e.target.value && updateStatut(Number(id), e.target.value).then(() => qc.invalidateQueries({ queryKey: ['devis', id] }))}
                defaultValue=""
                className="text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <option value="" disabled>Changer statut</option>
                {['brouillon','envoye','accepte','refuse','expire'].map(s => (
                  <option key={s} value={s}>{STATUT_LABEL[s]}</option>
                ))}
              </select>
            )}
            {!isNew && !isConverti && existing?.statut === 'accepte' && (
              <button onClick={doConvert} disabled={converting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 font-semibold disabled:opacity-50">
                <ShoppingCart className="w-3.5 h-3.5" />
                {converting ? 'Conversion…' : 'Concrétiser → Order Tracking'}
              </button>
            )}
            {isConverti && existing?.order_tracking_ref && (
              <div className="flex items-center gap-1.5 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-3 py-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                Commande : <strong>{existing.order_tracking_ref}</strong>
              </div>
            )}
            {!isNew && (
              <button
                onClick={async () => {
                  setPdfLoading(true)
                  try { await downloadDevisPdf(Number(id)) }
                  catch { alert('Erreur lors de la génération du PDF.') }
                  finally { setPdfLoading(false) }
                }}
                disabled={pdfLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 border text-xs rounded hover:bg-gray-50 text-gray-600 font-medium disabled:opacity-50">
                <FileText className={`w-3.5 h-3.5 ${pdfLoading ? 'animate-pulse' : ''}`} />
                {pdfLoading ? 'Génération…' : 'PDF'}
              </button>
            )}
            <button onClick={save} disabled={saving || isConverti}
              className="px-4 py-1.5 bg-red-700 text-white text-xs rounded hover:bg-red-800 font-semibold disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>

        {convertError && (
          <div className="mx-5 mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{convertError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Meta */}
          <div className="bg-white border rounded-lg p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Client</label>
              <ClientAutocomplete
                clientId={clientId}
                clientNomLibre={clientNomLibre}
                disabled={isConverti}
                onSelect={(id, nom) => { setClientId(id); setClientNomLibre(nom) }}
                onLibre={nom => { setClientId(null); setClientNomLibre(nom) }}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Validité</label>
              <input type="date" value={dateValidite} onChange={e => setDateValidite(e.target.value)}
                disabled={isConverti}
                className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">TVA défaut (%)</label>
              <input type="number" value={tva} onChange={e => setTva(Number(e.target.value))}
                disabled={isConverti}
                className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Délai de livraison</label>
              <input type="text" value={delaiLivraison} onChange={e => setDelaiLivraison(e.target.value)}
                disabled={isConverti}
                className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Modalité de paiement</label>
              <input type="text" value={modalitePaiement} onChange={e => setModalitePaiement(e.target.value)}
                disabled={isConverti}
                className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
            <div className="col-span-2 lg:col-span-4">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Notes internes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                disabled={isConverti} placeholder="Notes visibles uniquement en interne…"
                className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500 resize-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Conditions générales <span className="normal-case font-normal text-gray-400">(dernière page PDF)</span></label>
              <textarea value={conditions} onChange={e => setConditions(e.target.value)} rows={5}
                disabled={isConverti}
                className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500 resize-y font-mono" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Pourquoi choisir Miele ? <span className="normal-case font-normal text-gray-400">(dernière page PDF)</span></label>
              <textarea value={pourquoi} onChange={e => setPourquoi(e.target.value)} rows={5}
                disabled={isConverti}
                className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500 resize-y font-mono" />
            </div>
          </div>

          {/* Lignes */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 w-12">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500">Référence / Description</th>
                  <th className="text-center px-4 py-2.5 text-xs font-bold text-gray-500 w-20">Qté</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 w-32">P.U. HT</th>
                  <th className="text-center px-4 py-2.5 text-xs font-bold text-gray-500 w-20">Rem. %</th>
                  <th className="text-center px-4 py-2.5 text-xs font-bold text-gray-500 w-16">TVA %</th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 w-32">Total HT</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lignes.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">
                    Ajoutez des produits depuis le catalogue ou utilisez les boutons ci-dessous.
                  </td></tr>
                )}
                {lignes.map((l, i) => {
                  if (l.type === 'separateur') return (
                    <tr key={i} className="bg-gray-50">
                      <td colSpan={7} className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-0.5 bg-red-700 rounded" />
                          <input value={l.separateur_label ?? ''} disabled={isConverti}
                            onChange={e => updateLigne(i, { separateur_label: e.target.value })}
                            className="text-xs font-bold text-red-700 uppercase border-none bg-transparent outline-none tracking-wider" />
                          <div className="flex-1 h-0.5 bg-red-700 rounded" />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {!isConverti && <button onClick={() => delLigne(i)} className="text-gray-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </td>
                    </tr>
                  )

                  const net = calcLigne(l)
                  return (
                    <tr key={i} className={`hover:bg-gray-50 ${l.is_option ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2">
                        <input value={l.ref ?? ''} disabled={isConverti}
                          onChange={e => updateLigne(i, { ref: e.target.value })}
                          className="text-xs font-semibold border-b border-dashed border-gray-200 bg-transparent outline-none w-full mb-0.5" />
                        <input value={l.description ?? ''} disabled={isConverti}
                          onChange={e => updateLigne(i, { description: e.target.value })}
                          className="text-xs text-gray-500 border-b border-dashed border-gray-100 bg-transparent outline-none w-full" />
                        {l.finition && <div className="text-xs text-gray-400 mt-0.5">{l.finition}</div>}
                        <label className="flex items-center gap-1 mt-1 cursor-pointer">
                          <input type="checkbox" checked={l.is_option} disabled={isConverti}
                            onChange={e => updateLigne(i, { is_option: e.target.checked })}
                            className="w-3 h-3 accent-red-700" />
                          <span className="text-xs text-gray-400">Option</span>
                        </label>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input type="number" min={1} value={l.qty} disabled={isConverti}
                          onChange={e => updateLigne(i, { qty: Number(e.target.value) })}
                          className="w-16 text-center border rounded px-1 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-red-500" />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input type="number" min={0} value={l.prix_unitaire_ht} disabled={isConverti}
                          onChange={e => updateLigne(i, { prix_unitaire_ht: Number(e.target.value) })}
                          className="w-28 text-right border rounded px-1 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-red-500" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input type="number" min={0} max={100} value={l.remise_ligne_pct} disabled={isConverti}
                          onChange={e => updateLigne(i, { remise_ligne_pct: Number(e.target.value) })}
                          className="w-16 text-center border rounded px-1 py-1 text-xs text-red-700 font-bold focus:outline-none focus:ring-1 focus:ring-red-500" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input type="number" min={0} max={100} step={0.1} value={l.tva_taux ?? 20} disabled={isConverti}
                          onChange={e => updateLigne(i, { tva_taux: Number(e.target.value) })}
                          className="w-14 text-center border rounded px-1 py-1 text-xs text-gray-600 font-semibold focus:outline-none focus:ring-1 focus:ring-red-500" />
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-gray-800">
                        {l.is_option ? <span className="text-gray-400 italic text-xs">Option</span> : fmtHT(net)}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {!isConverti && <button onClick={() => delLigne(i)} className="text-gray-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {!isConverti && (
              <div className="px-4 py-3 border-t bg-gray-50 flex items-center gap-2">
                <button onClick={addSeparateur} className="text-xs border rounded px-3 py-1.5 text-gray-600 hover:bg-white flex items-center gap-1">
                  <Minus className="w-3 h-3" /> Séparateur
                </button>
                <button onClick={addLibre} className="text-xs border rounded px-3 py-1.5 text-gray-600 hover:bg-white flex items-center gap-1">
                  <PlusCircle className="w-3 h-3" /> Ligne libre
                </button>
              </div>
            )}
          </div>

          {/* Remise + Totaux */}
          <div className="flex justify-end gap-4">
            {/* Remise globale */}
            <div className="bg-white border rounded-lg p-4 w-64">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Remise globale</div>
              <div className="flex items-center gap-2">
                <input type="number" min={0} value={remiseGlobale} disabled={isConverti}
                  onChange={e => setRemiseGlobale(Number(e.target.value))}
                  className="w-20 text-center border rounded px-2 py-1.5 text-lg font-bold text-red-700 focus:outline-none focus:ring-1 focus:ring-red-500" />
                <div className="flex gap-1">
                  {(['pct', 'montant'] as const).map(t => (
                    <button key={t} disabled={isConverti}
                      onClick={() => setRemiseType(t)}
                      className={`text-xs px-2 py-1 rounded border font-medium ${remiseType === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500'}`}>
                      {t === 'pct' ? '%' : 'DH'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Totaux */}
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="text-sm">
                <tbody>
                  <tr className="border-b"><td className="px-5 py-2 text-gray-500 text-right">Total HT</td><td className="px-5 py-2 font-semibold text-right w-36">{fmtHT(totaux.ht)} DH</td></tr>
                  <tr className="border-b"><td className="px-5 py-2 text-gray-500 text-right">TVA</td><td className="px-5 py-2 font-semibold text-right">{fmtHT(totaux.tva)} DH</td></tr>
                  {totaux.remise > 0 && <tr className="border-b"><td className="px-5 py-2 text-red-700 text-right">Remise {remiseType === 'pct' ? `(${remiseGlobale}%)` : 'TTC'}</td><td className="px-5 py-2 font-semibold text-red-700 text-right">−{fmtHT(totaux.remiseTTC)} DH</td></tr>}
                  <tr className="bg-gray-900"><td className="px-5 py-3 text-white font-bold text-right">TOTAL TTC</td><td className="px-5 py-3 text-white font-bold text-right text-base">{fmt(totaux.ttc)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
