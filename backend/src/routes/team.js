import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import * as ctrl from '../controllers/team.js'

const router = Router()
router.use(requireAuth)
router.get('/', ctrl.list)
router.put('/:id', ctrl.update)
export default router
