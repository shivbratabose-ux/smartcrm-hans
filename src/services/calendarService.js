import api from './apiClient'
export const getEvents = () => api.get('/calendar').then(r => r.data)
export const getEvent = (id) => api.get(`/calendar/${id}`).then(r => r.data)
export const createEvent = (data) => api.post('/calendar', data).then(r => r.data)
export const updateEvent = (id, data) => api.put(`/calendar/${id}`, data).then(r => r.data)
export const deleteEvent = (id) => api.delete(`/calendar/${id}`)
