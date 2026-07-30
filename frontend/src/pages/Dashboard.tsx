import { useQuery } from '@tanstack/react-query'
import { getDevis } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import { FileText, CheckCircle, Clock, TrendingUp, Plus, ExternalLink } from 'lucide-react'
import type { Devis } from '../types'

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' DH'

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

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: devis = [] } = useQuery<Devis[]>({ queryKey: ['devis'], queryFn: () => getDevis() })

  const totalCA = devis.filter(d => d.statut === 'converti').reduce((s, d) => s + d.montant_ttc, 0)
  const enCours = devis.filter(d => ['brouillon', 'envoye'].includes(d.statut))
  const acceptes = devis.filter(d => d.statut === 'accepte')
  const convertis = devis.filter(d => d.statut === 'converti')

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <button onClick={() => navigate('/devis/new')}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-sm rounded-lg hover:bg-red-800 font-medium">
          <Plus className="w-4 h-4" /> Nouveau devis
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total devis', value: devis.length, icon: FileText, color: 'bg-gray-700' },
          { label: 'En cours', value: enCours.length, icon: Clock, color: 'bg-blue-600' },
          { label: 'Acceptés', value: acceptes.length, icon: CheckCircle, color: 'bg-green-600' },
          { label: 'CA converti', value: fmt(totalCA), icon: TrendingUp, color: 'bg-red-700' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-lg border p-5 flex items-center gap-4">
            <div className={`p-3 rounded-lg ${color}`}><Icon className="w-5 h-5 text-white" /></div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Devis récents */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">Devis récents</span>
          <button onClick={() => navigate('/devis')} className="text-xs text-red-700 hover:underline">Voir tout</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-5 py-2.5 text-gray-600 font-medium text-xs">Numéro</th>
              <th className="text-left px-5 py-2.5 text-gray-600 font-medium text-xs">Client</th>
              <th className="text-right px-5 py-2.5 text-gray-600 font-medium text-xs">Montant TTC</th>
              <th className="text-center px-5 py-2.5 text-gray-600 font-medium text-xs">Statut</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {devis.slice(0, 8).map(d => (
              <tr key={d.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/devis/${d.id}`)}>
                <td className="px-5 py-3 font-medium text-gray-900">{d.numero}</td>
                <td className="px-5 py-3 text-gray-600">{d.client?.nom || d.client_nom_libre || '—'}</td>
                <td className="px-5 py-3 text-right font-semibold">{fmt(d.montant_ttc)}</td>
                <td className="px-5 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUT_COLOR[d.statut]}`}>
                    {STATUT_LABEL[d.statut]}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  {d.order_tracking_ref && (
                    <span className="text-xs text-purple-600 flex items-center gap-1 justify-end">
                      <ExternalLink className="w-3 h-3" />{d.order_tracking_ref}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
