import { body } from 'express-validator'

export const ticketsValidators = {
  create: [
    body('title').notEmpty().withMessage('Title is required'),
    body('accountId').notEmpty().withMessage('Account is required'),
    body('description').notEmpty().withMessage('Description is required'),
  ],
  update: [body('title').optional().notEmpty()]
}
