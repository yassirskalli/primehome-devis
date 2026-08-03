import axios from 'axios'

export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE ?? '/devis/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('devis_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('devis_token')
      localStorage.removeItem('devis_user')
      window.location.href = '/devis/login'
    }
    return Promise.reject(error)
  }
)

export const login = (username: string, password: string) =>
  api.post('/auth/token', { username, password }).then(r => r.data)

export const getDevis = (statut?: string) =>
  api.get('/devis', { params: statut ? { statut } : {} }).then(r => r.data)

export const getDevisById = (id: number) =>
  api.get(`/devis/${id}`).then(r => r.data)

export const createDevis = (data: unknown) =>
  api.post('/devis', data).then(r => r.data)

export const updateDevis = (id: number, data: unknown) =>
  api.patch(`/devis/${id}`, data).then(r => r.data)

export const updateStatut = (id: number, statut: string) =>
  api.patch(`/devis/${id}/statut`, null, { params: { statut } }).then(r => r.data)

export const convertToOrder = (id: number) =>
  api.post(`/devis/${id}/convert`).then(r => r.data)

export const deleteDevis = (id: number) =>
  api.delete(`/devis/${id}`)

export const getClients = (q?: string) =>
  api.get('/clients', { params: q ? { q } : {} }).then(r => r.data)

export const createClient = (data: unknown) =>
  api.post('/clients', data).then(r => r.data)

export const getCatalogue = (q?: string, cat?: string) =>
  api.get('/catalogue', { params: { q, cat } }).then(r => r.data)

export const getCatalogueCategories = () =>
  api.get('/catalogue/categories').then(r => r.data)

// Odoo
export const searchOdooClients = (q: string) =>
  api.get('/odoo/clients', { params: { q } }).then(r => r.data)

export const syncOdooClients = () =>
  api.post('/odoo/sync-clients').then(r => r.data)

export const searchOdooProduits = (q: string) =>
  api.get('/odoo/produits', { params: { q } }).then(r => r.data)

export const syncOdooProduits = () =>
  api.post('/odoo/sync-produits').then(r => r.data)

export const getDevisOdoo = (state?: string) =>
  api.get('/odoo/devis-odoo', { params: state ? { state } : {} }).then(r => r.data)

export const openDevisOdooPdf = async (odooId: number): Promise<void> => {
  const res = await api.get(`/odoo/devis-odoo/${odooId}/pdf`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const win = window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  if (!win) window.location.href = url
}

export const uploadProduitImage = (produitId: number, file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(`/catalogue/${produitId}/image`, fd).then(r => r.data)
}

export const deleteProduitImage = (produitId: number) =>
  api.delete(`/catalogue/${produitId}/image`)

export const downloadDevisPdf = async (id: number): Promise<void> => {
  const res = await api.get(`/devis/${id}/pdf`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const win = window.open(url, '_blank')
  // Revoke after a delay to allow the browser to load it
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  if (!win) window.location.href = url
}
