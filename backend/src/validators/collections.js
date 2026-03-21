import { body } from 'express-validator'

export const collectionsValidators = {
  create: [
    body('accountId').notEmpty().withMessage('Account is required'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be > 0'),
  ],
  update: [body('amount').optional().isFloat({ gt: 0 })]
}
