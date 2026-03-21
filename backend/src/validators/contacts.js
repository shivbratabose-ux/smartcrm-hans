import { body } from 'express-validator'

export const contactsValidators = {
  create: [
    body('name').notEmpty().withMessage('Name is required'),
    body('accountId').notEmpty().withMessage('Account is required'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
  ],
  update: [
    body('name').optional().notEmpty(),
    body('email').optional().isEmail().withMessage('Invalid email format'),
  ]
}
