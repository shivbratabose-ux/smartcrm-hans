import supabase from '../lib/supabase.js'

export const pipelineSummary = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('opportunities').select('stage, value').eq('org_id', req.user.org_id)
    if (error) throw error
    const summary = data.reduce((acc, o) => {
      acc[o.stage] = (acc[o.stage] || 0) + (o.value || 0)
      return acc
    }, {})
    res.json(summary)
  } catch (err) { next(err) }
}

export const revenueByProduct = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('opportunities').select('products, value').eq('org_id', req.user.org_id).eq('stage', 'closed_won')
    if (error) throw error
    const summary = {}
    data.forEach(o => {
      (o.products || []).forEach(p => { summary[p] = (summary[p] || 0) + (o.value || 0) })
    })
    res.json(summary)
  } catch (err) { next(err) }
}

export const leadConversion = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('leads').select('stage').eq('org_id', req.user.org_id)
    if (error) throw error
    const counts = data.reduce((acc, l) => { acc[l.stage] = (acc[l.stage] || 0) + 1; return acc }, {})
    res.json(counts)
  } catch (err) { next(err) }
}

export const ticketSla = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('tickets').select('priority, status').eq('org_id', req.user.org_id).not('status', 'in', '("Resolved","Closed")')
    if (error) throw error
    const counts = data.reduce((acc, t) => { acc[t.priority] = (acc[t.priority] || 0) + 1; return acc }, {})
    res.json(counts)
  } catch (err) { next(err) }
}

export const collectionsAging = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('collections').select('aging_bucket, pending_amount').eq('org_id', req.user.org_id).gt('pending_amount', 0)
    if (error) throw error
    const summary = data.reduce((acc, c) => {
      const bucket = c.aging_bucket || 'Unknown'
      acc[bucket] = (acc[bucket] || 0) + (c.pending_amount || 0)
      return acc
    }, {})
    res.json(summary)
  } catch (err) { next(err) }
}

export const activityHeatmap = async (req, res, next) => {
  try {
    const since = new Date(); since.setDate(since.getDate() - 90)
    const { data, error } = await supabase.from('activities').select('date').eq('org_id', req.user.org_id).gte('date', since.toISOString().slice(0, 10))
    if (error) throw error
    const counts = data.reduce((acc, a) => { acc[a.date] = (acc[a.date] || 0) + 1; return acc }, {})
    res.json(counts)
  } catch (err) { next(err) }
}
