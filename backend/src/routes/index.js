import { Router } from 'express'
import authRouter from './auth.js'
import leadsRouter from './leads.js'
import accountsRouter from './accounts.js'
import contactsRouter from './contacts.js'
import opportunitiesRouter from './opportunities.js'
import activitiesRouter from './activities.js'
import ticketsRouter from './tickets.js'
import contractsRouter from './contracts.js'
import collectionsRouter from './collections.js'
import callReportsRouter from './callReports.js'
import quotationsRouter from './quotations.js'
import targetsRouter from './targets.js'
import calendarRouter from './calendar.js'
import commLogsRouter from './commLogs.js'
import notesRouter from './notes.js'
import filesRouter from './files.js'
import mastersRouter from './masters.js'
import orgRouter from './org.js'
import teamRouter from './team.js'
import reportsRouter from './reports.js'
import bulkUploadRouter from './bulkUpload.js'

const router = Router()
router.use('/auth', authRouter)
router.use('/leads', leadsRouter)
router.use('/accounts', accountsRouter)
router.use('/contacts', contactsRouter)
router.use('/opportunities', opportunitiesRouter)
router.use('/activities', activitiesRouter)
router.use('/tickets', ticketsRouter)
router.use('/contracts', contractsRouter)
router.use('/collections', collectionsRouter)
router.use('/call-reports', callReportsRouter)
router.use('/quotations', quotationsRouter)
router.use('/targets', targetsRouter)
router.use('/calendar', calendarRouter)
router.use('/communications', commLogsRouter)
router.use('/notes', notesRouter)
router.use('/files', filesRouter)
router.use('/masters', mastersRouter)
router.use('/org', orgRouter)
router.use('/team', teamRouter)
router.use('/reports', reportsRouter)
router.use('/bulk-upload', bulkUploadRouter)

export default router
