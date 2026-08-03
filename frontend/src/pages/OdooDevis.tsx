import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getDevisOdoo, openDevisOdooPdf } from '../lib/api'
import { RefreshCw, FileText, ChevronUp, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface OdooDevis {
  id: number
  name: string
  partner: string | null
  commercial: string | null
  date_order: string | null
  validity_date: string | null
  amount_total: number
  state: string
  state_label: string
}

const STATE_COLOR: Record<string, string> = {
  draft:  'bg-gray-100 text-gray-600',
  sent:   'bg-blue-100 text-blue-700',
  sale:   'bg-green-100 text-green-700',
  done:   'bg-purple-100 text-purple-700',
  cancel: 'bg-red-100 text-red-700',
}

const STATES = [
  { value: '', label: 'Tous' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'sent', label: 'Envoyé' },
  { value: 'sale', label: 'Bon de commande' },
  { value: 'done', label: 'Clôturé' },
]

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' DH'
const fmtDate = (d: string | null) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: fr }) : '—'

type SortField = 'name' | 'partner' | 'date_order' | 'amount_total' | 'state_label' | 'commercial'
type SortDir = 'asc' | 'desc'

export function OdooDevisPage() {
  const qc = useQueryClient()
  const [stateFilter, setStateFilter] = useState('')
  const [search, setSearch] = useState('')
  const [openingPdf, setOpeningPdf] = useState<number | null>(null)
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'date_order', dir: 'desc' })

  const { data: devis = [], isFetching, error } = useQuery<OdooDevis[]>({
    queryKey: ['odoo-devis', stateFilter],
    queryFn: () => getDevisOdoo(stateFilter || undefined),
    staleTime: 60_000,
  })

  function toggleSort(field: SortField) {
    setSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })
  }

  const filtered = devis
    .filter(d => {
      if (!search) return true
      const q = search.toLowerCase()
      return (d.name || '').toLowerCase().includes(q)
        || (d.partner || '').toLowerCase().includes(q)
        || (d.commercial || '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      let va: string | number = a[sort.field] as string | number ?? ''
      let vb: string | number = b[sort.field] as string | number ?? ''
      if (sort.field === 'date_order') { va = va ? new Date(va as string).getTime() : 0; vb = vb ? new Date(vb as string).getTime() : 0 }
      else if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb as string).toLowerCase() }
      return sort.dir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0)
    })

  async function handlePdf(id: number) {
    setOpeningPdf(id)
    try { await openDevisOdooPdf(id) }
    catch { alert('Impossible de charger le PDF.') }
    finally { setOpeningPdf(null) }
  }

  function SortTh({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) {
    const active = sort.field === field
    return (
      <th
        className={`text-left px-4 py-2.5 text-gray-600 font-medium text-xs cursor-pointer select-none hover:text-gray-900 ${className ?? ''}`}
        onClick={() => toggleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {active
            ? sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
            : <ChevronUp size={11} className="opacity-20" />}
        </span>
      </th>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Devis Odoo</h1>
          <p className="text-xs text-gray-400 mt-0.5">Devis et bons de commande générés dans Odoo</p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['odoo-devis'] })}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 border rounded hover:bg-gray-50 text-gray-600 disabled:opacity-50"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-white border rounded-lg px-4 py-3 flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher (N°, client, commercial)..."
          className="text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500 w-64"
        />
        <div className="flex gap-1">
          {STATES.map(s => (
            <button
              key={s.value}
              onClick={() => setStateFilter(s.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                stateFilter === s.value
                  ? 'bg-red-700 text-white border-red-700'
                  : 'text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {isFetching && <RefreshCw size={14} className="text-gray-400 animate-spin" />}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} résultat(s)</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-sm text-red-700">
          Erreur de connexion à Odoo. Vérifiez la configuration.
        </div>
      )}

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <SortTh field="name">N° Devis</SortTh>
              <SortTh field="partner">Client</SortTh>
              <SortTh field="commercial">Commercial</SortTh>
              <SortTh field="date_order">Date</SortTh>
              <SortTh field="amount_total" className="text-right">Montant</SortTh>
              <SortTh field="state_label">Statut</SortTh>
              <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && !isFetching && (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">
                {error ? 'Erreur Odoo' : 'Aucun devis trouvé'}
              </td></tr>
            )}
            {filtered.map(d => (
              <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono font-medium text-gray-900">{d.name}</td>
                <td className="px-4 py-3 text-gray-700">{d.partner ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{d.commercial ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{fmtDate(d.date_order)}</td>
                <td className="px-4 py-3 text-right font-medium">{fmt(d.amount_total)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATE_COLOR[d.state] ?? 'bg-gray-100 text-gray-600'}`}>
                    {d.state_label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handlePdf(d.id)}
                    disabled={openingPdf === d.id}
                    className="flex items-center gap-1 text-xs text-red-700 hover:text-red-900 disabled:opacity-50"
                  >
                    {openingPdf === d.id
                      ? <RefreshCw size={13} className="animate-spin" />
                      : <FileText size={13} />}
                    PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
