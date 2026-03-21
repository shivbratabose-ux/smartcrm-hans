import api from './apiClient'
export const getActivities = () => api.get('/activities').then(r => r.data)
export const getActivity = (id) => api.get(`/activities/${id}`).then(r => r.data)
export const createActivity = (data) => api.post('/activities', data).then(r => r.data)
export const updateActivity = (id, data) => api.put(`/activities/${id}`, data).then(r => r.data)
export const deleteActivity = (id) => api.delete(`/activities/${id}`)
