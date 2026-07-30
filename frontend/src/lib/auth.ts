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
