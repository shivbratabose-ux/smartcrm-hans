import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { runValidation } from '../middleware/validate.js'
import { accountsValidators } from '../validators/accounts.js'
import * as ctrl from '../controllers/accounts.js'

const router = Router()
router.use(requireAuth)
router.get('/', ctrl.list)
router.get('/:id', ctrl.getOne)
router.post('/', accountsValidators.create, runValidation, ctrl.create)
router.put('/:id', accountsValidators.update, runValidation, ctrl.update)
router.delete('/:id', ctrl.remove)
export default router
