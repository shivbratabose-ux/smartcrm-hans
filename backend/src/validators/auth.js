import { body } from 'express-validator'

export const authValidators = {
  login: [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ]
}
