import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { runValidation } from '../middleware/validate.js'
import { opportunitiesValidators } from '../validators/opportunities.js'
import * as ctrl from '../controllers/opportunities.js'

const router = Router()
router.use(requireAuth)
router.get('/', ctrl.list)
router.get('/:id', ctrl.getOne)
router.post('/', opportunitiesValidators.create, runValidation, ctrl.create)
router.put('/:id', opportunitiesValidators.update, runValidation, ctrl.update)
router.delete('/:id', ctrl.remove)
export default router
