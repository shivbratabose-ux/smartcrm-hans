import api from './apiClient'

export const login = async (email, password) => {
  const { data } = await api.post('/auth/login', { email, password })
  sessionStorage.setItem('smartcrm_token', data.token)
  return data.user
}

export const logout = () => {
  sessionStorage.removeItem('smartcrm_token')
}

export const getStoredUser = () => {
  const token = sessionStorage.getItem('smartcrm_token')
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.exp * 1000 < Date.now()) {
      sessionStorage.removeItem('smartcrm_token')
      return null
    }
    return payload
  } catch { return null }
}
