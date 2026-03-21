import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { runValidation } from '../middleware/validate.js'
import { activitiesValidators } from '../validators/activities.js'
import * as ctrl from '../controllers/activities.js'

const router = Router()
router.use(requireAuth)
router.get('/', ctrl.list)
router.get('/:id', ctrl.getOne)
router.post('/', activitiesValidators.create, runValidation, ctrl.create)
router.put('/:id', activitiesValidators.update, runValidation, ctrl.update)
router.delete('/:id', ctrl.remove)
export default router
