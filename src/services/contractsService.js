import api from './apiClient'
export const getContracts = () => api.get('/contracts').then(r => r.data)
export const getContract = (id) => api.get(`/contracts/${id}`).then(r => r.data)
export const createContract = (data) => api.post('/contracts', data).then(r => r.data)
export const updateContract = (id, data) => api.put(`/contracts/${id}`, data).then(r => r.data)
export const deleteContract = (id) => api.delete(`/contracts/${id}`)
