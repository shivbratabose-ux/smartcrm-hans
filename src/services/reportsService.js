import api from './apiClient'
export const getPipelineSummary = () => api.get('/reports/pipeline-summary').then(r => r.data)
export const getRevenueByProduct = () => api.get('/reports/revenue-by-product').then(r => r.data)
export const getLeadConversion = () => api.get('/reports/lead-conversion').then(r => r.data)
export const getTicketSla = () => api.get('/reports/ticket-sla').then(r => r.data)
export const getCollectionsAging = () => api.get('/reports/collections-aging').then(r => r.data)
export const getActivityHeatmap = () => api.get('/reports/activity-heatmap').then(r => r.data)
