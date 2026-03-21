import api from './apiClient'
export const getTargets = () => api.get('/targets').then(r => r.data)
export const getTarget = (id) => api.get(`/targets/${id}`).then(r => r.data)
export const createTarget = (data) => api.post('/targets', data).then(r => r.data)
export const updateTarget = (id, data) => api.put(`/targets/${id}`, data).then(r => r.data)
export const deleteTarget = (id) => api.delete(`/targets/${id}`)
