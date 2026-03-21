import { body } from 'express-validator'

export const accountsValidators = {
  create: [body('name').notEmpty().withMessage('Account name is required')],
  update: [body('name').optional().notEmpty().withMessage('Name cannot be empty')]
}
