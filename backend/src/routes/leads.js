import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { runValidation } from '../middleware/validate.js'
import { leadsValidators } from '../validators/leads.js'
import * as ctrl from '../controllers/leads.js'

const router = Router()
router.use(requireAuth)
router.get('/', ctrl.list)
router.get('/:id', ctrl.getOne)
router.post('/', leadsValidators.create, runValidation, ctrl.create)
router.put('/:id', leadsValidators.update, runValidation, ctrl.update)
router.delete('/:id', ctrl.remove)
export default router
