import api from './apiClient'
export const getCallReports = () => api.get('/call-reports').then(r => r.data)
export const getCallReport = (id) => api.get(`/call-reports/${id}`).then(r => r.data)
export const createCallReport = (data) => api.post('/call-reports', data).then(r => r.data)
export const updateCallReport = (id, data) => api.put(`/call-reports/${id}`, data).then(r => r.data)
export const deleteCallReport = (id) => api.delete(`/call-reports/${id}`)
