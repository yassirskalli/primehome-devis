import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClients, createClient, syncOdooClients } from '../lib/api'
import { Plus, X, Users, RefreshCw, Check } from 'lucide-react'
import type { Client } from '../types'

interface CreateForm {
  nom: string
  prenom: string
  telephone: string
  email: string
  adresse: string
  ville: string
  ice: string
}

const EMPTY: CreateForm = { nom: '', prenom: '', telephone: '', email: '', adresse: '', ville: '', ice: '' }

export function ClientsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<CreateForm>(EMPTY)
  const [error, setError] = useState('')

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients', search],
    queryFn: () => getClients(search || undefined),
  })

  const createMut = useMutation({
    mutationFn: () => createClient(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      setShowModal(false)
      setForm(EMPTY)
      setError('')
    },
    onError: () => setError('Erreur lors de la création.'),
  })

  const [syncResult, setSyncResult] = useState<{ crees: number; mis_a_jour: number } | null>(null)
  const syncMut = useMutation({
    mutationFn: syncOdooClients,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      setSyncResult(data)
      setTimeout(() => setSyncResult(null), 4000)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nom.trim()) { setError('Le nom est requis.'); return }
    createMut.mutate()
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
        <div className="flex items-center gap-2">
          {syncResult && (
            <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-1.5">
              <Check className="w-3.5 h-3.5" />
              {syncResult.crees} créés, {syncResult.mis_a_jour} mis à jour
            </span>
          )}
          <button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}
            className="flex items-center gap-2 px-4 py-2 border text-sm rounded-lg text-gray-600 hover:bg-gray-50 font-medium disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${syncMut.isPending ? 'animate-spin' : ''}`} />
            {syncMut.isPending ? 'Sync…' : 'Sync Odoo'}
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-sm rounded-lg hover:bg-red-800 font-medium">
            <Plus className="w-4 h-4" /> Nouveau client
          </button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <input
          type="text"
          placeholder="Rechercher un client…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Chargement…</div>
        ) : clients.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Aucun client trouvé</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-5 py-2.5 text-gray-600 font-medium text-xs">Nom</th>
                <th className="text-left px-5 py-2.5 text-gray-600 font-medium text-xs">Téléphone</th>
                <th className="text-left px-5 py-2.5 text-gray-600 font-medium text-xs">Email</th>
                <th className="text-left px-5 py-2.5 text-gray-600 font-medium text-xs">Ville</th>
                <th className="text-left px-5 py-2.5 text-gray-600 font-medium text-xs">ICE</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {clients.map((c: Client) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">
                    {c.nom}{c.prenom ? ` ${c.prenom}` : ''}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{c.telephone || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{c.email || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{c.ville || '—'}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs font-mono">{c.ice || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">Nouveau client</h2>
              <button onClick={() => { setShowModal(false); setForm(EMPTY); setError('') }}>
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nom *</label>
                  <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Prénom</label>
                  <input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Téléphone</label>
                  <input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Adresse</label>
                <input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))}
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ville</label>
                  <input value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))}
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">ICE</label>
                  <input value={form.ice} onChange={e => setForm(f => ({ ...f, ice: e.target.value }))}
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setForm(EMPTY); setError('') }}
                  className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">
                  Annuler
                </button>
                <button type="submit" disabled={createMut.isPending}
                  className="px-4 py-2 text-sm bg-red-700 text-white rounded-lg hover:bg-red-800 disabled:opacity-50 font-medium">
                  {createMut.isPending ? 'Création…' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
