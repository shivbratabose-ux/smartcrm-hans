import bcrypt from 'bcryptjs'
import { signToken } from '../lib/jwt.js'
import supabase from '../lib/supabase.js'

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, role, lob, active, password_hash, org_id')
      .eq('email', email.toLowerCase().trim())
      .single()
    if (error || !user) return res.status(401).json({ error: 'Invalid credentials' })
    if (!user.active) return res.status(403).json({ error: 'Account deactivated' })
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
    const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name, org_id: user.org_id })
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, lob: user.lob } })
  } catch (err) {
    next(err)
  }
}

export const refresh = async (req, res, next) => {
  try {
    const { id, email, role, name, org_id } = req.user
    const token = signToken({ id, email, role, name, org_id })
    res.json({ token })
  } catch (err) {
    next(err)
  }
}

export const logout = (_req, res) => {
  res.json({ message: 'Logged out' })
}
