import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { runValidation } from '../middleware/validate.js'
import { collectionsValidators } from '../validators/collections.js'
import * as ctrl from '../controllers/collections.js'

const router = Router()
router.use(requireAuth)
router.get('/', ctrl.list)
router.get('/:id', ctrl.getOne)
router.post('/', collectionsValidators.create, runValidation, ctrl.create)
router.put('/:id', collectionsValidators.update, runValidation, ctrl.update)
router.delete('/:id', ctrl.remove)
export default router
