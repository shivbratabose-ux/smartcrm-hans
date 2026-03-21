import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import * as ctrl from '../controllers/files.js'

const router = Router()
router.use(requireAuth)
router.get('/', ctrl.list)
router.delete('/:id', ctrl.remove)
export default router
