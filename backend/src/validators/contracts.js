import { body } from 'express-validator'

export const contractsValidators = {
  create: [
    body('title').notEmpty().withMessage('Title is required'),
    body('accountId').notEmpty().withMessage('Account is required'),
  ],
  update: [body('title').optional().notEmpty()]
}
