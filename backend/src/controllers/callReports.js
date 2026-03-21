import supabase from '../lib/supabase.js'

const TABLE = 'call_reports'

export const list = async (req, res, next) => {
  try {
    const { org_id } = req.user
    const { data, error } = await supabase.from(TABLE).select('*').eq('org_id', org_id).order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err) { next(err) }
}

export const getOne = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', req.params.id).eq('org_id', req.user.org_id).single()
    if (error || !data) return res.status(404).json({ error: 'Not found' })
    res.json(data)
  } catch (err) { next(err) }
}

export const create = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from(TABLE).insert({ ...req.body, org_id: req.user.org_id, owner_id: req.user.id }).select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { next(err) }
}

export const update = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from(TABLE).update({ ...req.body, updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('org_id', req.user.org_id).select().single()
    if (error || !data) return res.status(404).json({ error: 'Not found' })
    res.json(data)
  } catch (err) { next(err) }
}

export const remove = async (req, res, next) => {
  try {
    const { error } = await supabase.from(TABLE).delete().eq('id', req.params.id).eq('org_id', req.user.org_id)
    if (error) throw error
    res.status(204).send()
  } catch (err) { next(err) }
}
