import { body } from 'express-validator'

export const opportunitiesValidators = {
  create: [
    body('title').notEmpty().withMessage('Title is required'),
    body('accountId').notEmpty().withMessage('Account is required'),
    body('value').isFloat({ min: 0 }).withMessage('Value must be >= 0'),
    body('closeDate').notEmpty().withMessage('Close date is required'),
  ],
  update: [
    body('title').optional().notEmpty(),
    body('value').optional().isFloat({ min: 0 }),
  ]
}
