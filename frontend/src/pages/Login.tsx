import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/api'
import { setAuth } from '../lib/auth'

export function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await login(username, password)
      setAuth(res.access_token, username)
      navigate('/')
    } catch {
      setError('Identifiants incorrects.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/logo_primehome.png" alt="Prime Home" className="h-20 w-auto object-contain mx-auto mb-3" />
          <div className="text-sm text-gray-500">Générateur de Devis — Prime Home SARL</div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Utilisateur</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} autoFocus
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Mot de passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2 bg-red-700 text-white rounded font-semibold text-sm hover:bg-red-800 disabled:opacity-50">
            {loading ? 'Connexion…' : 'Connexion'}
          </button>
        </form>
      </div>
    </div>
  )
}
