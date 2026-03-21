import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import * as ctrl from '../controllers/masters.js'

const router = Router()
router.use(requireAuth)
router.get('/', ctrl.list)
router.get('/:id', ctrl.getOne)
router.post('/', ctrl.create)
router.put('/:id', ctrl.update)
router.delete('/:id', ctrl.remove)
export default router
