import api from './apiClient'
export const getAccounts = () => api.get('/accounts').then(r => r.data)
export const getAccount = (id) => api.get(`/accounts/${id}`).then(r => r.data)
export const createAccount = (data) => api.post('/accounts', data).then(r => r.data)
export const updateAccount = (id, data) => api.put(`/accounts/${id}`, data).then(r => r.data)
export const deleteAccount = (id) => api.delete(`/accounts/${id}`)
