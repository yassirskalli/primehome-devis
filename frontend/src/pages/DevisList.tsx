import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getDevis, deleteDevis, updateStatut } from '../lib/api'
import { Plus, Trash2, ExternalLink, FileText, ChevronUp, ChevronDown } from 'lucide-react'
import type { Devis } from '../types'

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' DH'

const STATUTS = ['', 'brouillon', 'envoye', 'accepte', 'refuse', 'converti', 'expire'] as const

const STATUT_LABEL: Record<string, string> = {
  brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté',
  refuse: 'Refusé', converti: 'Converti', expire: 'Expiré',
}
const STATUT_COLOR: Record<string, string> = {
  brouillon: 'bg-gray-100 text-gray-600',
  envoye: 'bg-blue-100 text-blue-700',
  accepte: 'bg-green-100 text-green-700',
  refuse: 'bg-red-100 text-red-700',
  converti: 'bg-purple-100 text-purple-700',
  expire: 'bg-orange-100 text-orange-700',
}

export function DevisListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [filter, setFilter] = useState('')
  const [sortField, setSortField] = useState<string>('date_creation')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function SortTh({ field, children, className }: { field: string; children: React.ReactNode; className?: string }) {
    const active = sortField === field
    return (
      <th
        className={`text-left px-5 py-2.5 text-gray-600 font-medium text-xs cursor-pointer select-none hover:text-gray-900 ${className ?? ''}`}
        onClick={() => toggleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {active
            ? sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
            : <ChevronUp size={11} className="opacity-20" />}
        </span>
      </th>
    )
  }

  const { data: devis = [], isLoading } = useQuery<Devis[]>({
    queryKey: ['devis', filter],
    queryFn: () => getDevis(filter || undefined),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDevis(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devis'] }),
  })

  const statutMut = useMutation({
    mutationFn: ({ id, statut }: { id: number; statut: string }) => updateStatut(id, statut),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devis'] }),
  })

  const sorted = useMemo(() => {
    return [...devis].sort((a, b) => {
      let av: string | number = '', bv: string | number = ''
      if (sortField === 'numero') { av = a.numero; bv = b.numero }
      else if (sortField === 'client') { av = a.client?.nom || a.client_nom_libre || ''; bv = b.client?.nom || b.client_nom_libre || '' }
      else if (sortField === 'commercial') { av = a.commercial || ''; bv = b.commercial || '' }
      else if (sortField === 'montant_ttc') { av = a.montant_ttc; bv = b.montant_ttc }
      else if (sortField === 'statut') { av = a.statut; bv = b.statut }
      else if (sortField === 'date_creation') { av = a.date_creation; bv = b.date_creation }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [devis, sortField, sortDir])

  function handleDelete(e: React.MouseEvent, d: Devis) {
    e.stopPropagation()
    if (d.statut === 'converti') return
    if (window.confirm(`Supprimer le devis ${d.numero} ?`)) deleteMut.mutate(d.id)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Devis</h1>
        <button onClick={() => navigate('/devis/new')}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-sm rounded-lg hover:bg-red-800 font-medium">
          <Plus className="w-4 h-4" /> Nouveau devis
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUTS.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
              filter === s
                ? 'bg-gray-900 text-white'
                : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}>
            {s ? STATUT_LABEL[s] : 'Tous'}
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Chargement…</div>
        ) : devis.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Aucun devis trouvé</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <SortTh field="numero">Numéro</SortTh>
                <SortTh field="client">Client</SortTh>
                <SortTh field="commercial">Commercial</SortTh>
                <SortTh field="montant_ttc" className="!text-right">Montant TTC</SortTh>
                <SortTh field="statut" className="!text-center">Statut</SortTh>
                <SortTh field="date_creation">Date</SortTh>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map(d => (
                <tr key={d.id} className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/devis/${d.id}`)}>
                  <td className="px-5 py-3 font-medium text-gray-900">{d.numero}</td>
                  <td className="px-5 py-3 text-gray-600">{d.client?.nom || d.client_nom_libre || '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{d.commercial || '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold">{fmt(d.montant_ttc)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUT_COLOR[d.statut]}`}>
                      {STATUT_LABEL[d.statut]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {new Date(d.date_creation).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 justify-end">
                      {d.order_tracking_ref && (
                        <span className="text-xs text-purple-600 flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" />{d.order_tracking_ref}
                        </span>
                      )}
                      {d.statut !== 'converti' && (
                        <button onClick={e => handleDelete(e, d)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                          title="Supprimer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
