import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { runValidation } from '../middleware/validate.js'
import { authValidators } from '../validators/auth.js'
import { authLimiter } from '../middleware/rateLimiter.js'
import { login, refresh, logout } from '../controllers/auth.js'

const router = Router()
router.post('/login', authLimiter, authValidators.login, runValidation, login)
router.post('/refresh', requireAuth, refresh)
router.post('/logout', requireAuth, logout)
export default router
