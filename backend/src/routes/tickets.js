import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { runValidation } from '../middleware/validate.js'
import { ticketsValidators } from '../validators/tickets.js'
import * as ctrl from '../controllers/tickets.js'

const router = Router()
router.use(requireAuth)
router.get('/', ctrl.list)
router.get('/:id', ctrl.getOne)
router.post('/', ticketsValidators.create, runValidation, ctrl.create)
router.put('/:id', ticketsValidators.update, runValidation, ctrl.update)
router.delete('/:id', ctrl.remove)
export default router
