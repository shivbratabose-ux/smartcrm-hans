import { body } from 'express-validator'

export const activitiesValidators = {
  create: [
    body('title').notEmpty().withMessage('Title is required'),
    body('date').notEmpty().withMessage('Date is required'),
    body('accountId').notEmpty().withMessage('Account is required'),
  ],
  update: [body('title').optional().notEmpty()]
}
