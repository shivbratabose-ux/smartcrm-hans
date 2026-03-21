import api from './apiClient'
export const getCommLogs = () => api.get('/communications').then(r => r.data)
export const getCommLog = (id) => api.get(`/communications/${id}`).then(r => r.data)
export const createCommLog = (data) => api.post('/communications', data).then(r => r.data)
export const updateCommLog = (id, data) => api.put(`/communications/${id}`, data).then(r => r.data)
export const deleteCommLog = (id) => api.delete(`/communications/${id}`)
