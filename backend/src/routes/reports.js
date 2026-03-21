import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import * as ctrl from '../controllers/reports.js'

const router = Router()
router.use(requireAuth)
router.get('/pipeline-summary', ctrl.pipelineSummary)
router.get('/revenue-by-product', ctrl.revenueByProduct)
router.get('/lead-conversion', ctrl.leadConversion)
router.get('/ticket-sla', ctrl.ticketSla)
router.get('/collections-aging', ctrl.collectionsAging)
router.get('/activity-heatmap', ctrl.activityHeatmap)
export default router
