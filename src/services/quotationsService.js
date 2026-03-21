import api from './apiClient'
export const getQuotations = () => api.get('/quotations').then(r => r.data)
export const getQuotation = (id) => api.get(`/quotations/${id}`).then(r => r.data)
export const createQuotation = (data) => api.post('/quotations', data).then(r => r.data)
export const updateQuotation = (id, data) => api.put(`/quotations/${id}`, data).then(r => r.data)
export const deleteQuotation = (id) => api.delete(`/quotations/${id}`)
