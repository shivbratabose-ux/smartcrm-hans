import supabase from '../lib/supabase.js'

const TABLE_MAP = {
  leads: 'leads',
  accounts: 'accounts',
  contacts: 'contacts',
  collections: 'collections',
  tickets: 'tickets',
  contracts: 'contracts',
}

export const upload = async (req, res, next) => {
  try {
    const { type, records } = req.body
    const table = TABLE_MAP[type?.toLowerCase()]
    if (!table) return res.status(400).json({ error: 'Invalid type. Must be one of: ' + Object.keys(TABLE_MAP).join(', ') })
    if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'records must be a non-empty array' })
    const rows = records.map(r => ({ ...r, org_id: req.user.org_id, owner_id: req.user.id }))
    const { data, error } = await supabase.from(table).insert(rows).select()
    if (error) throw error
    res.status(201).json({ inserted: data.length, records: data })
  } catch (err) { next(err) }
}
