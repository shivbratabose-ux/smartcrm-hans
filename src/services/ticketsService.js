import api from './apiClient'
export const getTickets = () => api.get('/tickets').then(r => r.data)
export const getTicket = (id) => api.get(`/tickets/${id}`).then(r => r.data)
export const createTicket = (data) => api.post('/tickets', data).then(r => r.data)
export const updateTicket = (id, data) => api.put(`/tickets/${id}`, data).then(r => r.data)
export const deleteTicket = (id) => api.delete(`/tickets/${id}`)
