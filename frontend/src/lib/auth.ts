export const getToken = () => localStorage.getItem('devis_token')
export const getUser = () => localStorage.getItem('devis_user')
export const setAuth = (token: string, user: string) => {
  localStorage.setItem('devis_token', token)
  localStorage.setItem('devis_user', user)
}
export const clearAuth = () => {
  localStorage.removeItem('devis_token')
  localStorage.removeItem('devis_user')
}
export const isAuthenticated = () => !!getToken()

export function getRoles(): string[] {
  const token = getToken()
  if (!token) return []
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.roles ?? []
  } catch { return [] }
}

export const hasRole = (role: string) => getRoles().includes(role)
