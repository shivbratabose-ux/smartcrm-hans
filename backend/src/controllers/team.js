import supabase from '../lib/supabase.js'

const TABLE = 'users'

export const list = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from(TABLE).select('id, email, name, role, lob, active, org_id').eq('org_id', req.user.org_id)
    if (error) throw error
    res.json(data)
  } catch (err) { next(err) }
}

export const update = async (req, res, next) => {
  try {
    const { password_hash, ...safe } = req.body
    const { data, error } = await supabase.from(TABLE).update({ ...safe, updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('org_id', req.user.org_id).select('id, email, name, role, lob, active').single()
    if (error || !data) return res.status(404).json({ error: 'Not found' })
    res.json(data)
  } catch (err) { next(err) }
}
