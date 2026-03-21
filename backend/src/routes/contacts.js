import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { runValidation } from '../middleware/validate.js'
import { contactsValidators } from '../validators/contacts.js'
import * as ctrl from '../controllers/contacts.js'

const router = Router()
router.use(requireAuth)
router.get('/', ctrl.list)
router.get('/:id', ctrl.getOne)
router.post('/', contactsValidators.create, runValidation, ctrl.create)
router.put('/:id', contactsValidators.update, runValidation, ctrl.update)
router.delete('/:id', ctrl.remove)
export default router
