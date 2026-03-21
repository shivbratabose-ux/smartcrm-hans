import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod'
const EXPIRES = process.env.JWT_EXPIRES_IN || '8h'

export const signToken = (payload) => jwt.sign(payload, SECRET, { expiresIn: EXPIRES })
export const verifyToken = (token) => jwt.verify(token, SECRET)
