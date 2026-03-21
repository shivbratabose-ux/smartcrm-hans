import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { runValidation } from '../middleware/validate.js'
import { contractsValidators } from '../validators/contracts.js'
import * as ctrl from '../controllers/contracts.js'

const router = Router()
router.use(requireAuth)
router.get('/', ctrl.list)
router.get('/:id', ctrl.getOne)
router.post('/', contractsValidators.create, runValidation, ctrl.create)
router.put('/:id', contractsValidators.update, runValidation, ctrl.update)
router.delete('/:id', ctrl.remove)
export default router
