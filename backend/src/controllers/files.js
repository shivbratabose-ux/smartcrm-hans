import supabase from '../lib/supabase.js'

const TABLE = 'files'

export const list = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from(TABLE).select('*').eq('org_id', req.user.org_id).order('created_at', { ascending: false })
    if (error) throw error
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
