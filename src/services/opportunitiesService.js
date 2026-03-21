import api from './apiClient'
export const getOpportunities = () => api.get('/opportunities').then(r => r.data)
export const getOpportunity = (id) => api.get(`/opportunities/${id}`).then(r => r.data)
export const createOpportunity = (data) => api.post('/opportunities', data).then(r => r.data)
export const updateOpportunity = (id, data) => api.put(`/opportunities/${id}`, data).then(r => r.data)
export const deleteOpportunity = (id) => api.delete(`/opportunities/${id}`)
