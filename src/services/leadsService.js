import api from './apiClient'
export const getLeads = () => api.get('/leads').then(r => r.data)
export const getLead = (id) => api.get(`/leads/${id}`).then(r => r.data)
export const createLead = (data) => api.post('/leads', data).then(r => r.data)
export const updateLead = (id, data) => api.put(`/leads/${id}`, data).then(r => r.data)
export const deleteLead = (id) => api.delete(`/leads/${id}`)
