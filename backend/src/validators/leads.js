import { body } from 'express-validator'

export const leadsValidators = {
  create: [
    body('company').notEmpty().withMessage('Company is required'),
    body('product').notEmpty().withMessage('Product is required'),
    body('assignedTo').notEmpty().withMessage('Assigned to is required'),
  ],
  update: [
    body('company').optional().notEmpty().withMessage('Company cannot be empty'),
  ]
}
