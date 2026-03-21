import api from './apiClient'
export const getCollections = () => api.get('/collections').then(r => r.data)
export const getCollection = (id) => api.get(`/collections/${id}`).then(r => r.data)
export const createCollection = (data) => api.post('/collections', data).then(r => r.data)
export const updateCollection = (id, data) => api.put(`/collections/${id}`, data).then(r => r.data)
export const deleteCollection = (id) => api.delete(`/collections/${id}`)
