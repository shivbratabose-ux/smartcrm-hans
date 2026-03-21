import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { upload } from '../controllers/bulkUpload.js'

const router = Router()
router.use(requireAuth)
router.post('/', upload)
export default router
