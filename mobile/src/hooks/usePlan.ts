// usePlan — the data hook backing the Plan tab.
// ─────────────────────────────────────────────────────────────────────────────
// Pulls a unified list of "things on your plate" across four source tables:
//   - leads.next_call            → followup
//   - activities.date            → task / meeting (depends on a.type)
//   - events.date                → meeting
//   - call_reports.call_date     → logged calls (read-only history)
//
// Each row is normalised to a `PlanItem` so the UI renders one uniform list.
// The `filter` arg constrains the date window:
//   today    — exactly today
//   tomorrow — exactly tomorrow
//   week     — next 7 days inclusive
//   overdue  — date < today AND not done
//
// Mutations live alongside (markDone, reschedule, snoozeFollowup, addComment)
// because they all invalidate the same cache key.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, isSupabaseConfigured } from '@/lib/supabase';

export type PlanFilter = 'today' | 'tomorrow' | 'week' | 'overdue';

export type PlanItem = {
  id: string;                      // composite key like "lead_<uuid>"
  kind: 'followup' | 'task' | 'meeting' | 'call';
  title: string;
  subtitle?: string | null;
  date: string | null;             // ISO date "YYYY-MM-DD"
  time: string | null;             // "HH:MM" or null
  status: 'planned' | 'done' | 'overdue';
  refTable: 'leads' | 'activities' | 'events' | 'call_reports';
  refId: string;
  accountId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  notes?: string | null;
};

const COLS = {
  leads:        'id, lead_id, company, contact_name, phone, next_call, account_id, notes',
  activities:   'id, type, status, title, date, time, account_id, contact_id, notes, owner',
  events:       'id, title, date, time, location, account_id, contact_id, notes, owner',
  call_reports: 'id, call_type, call_date, lead_name, account_id, contact_id, outcome, notes',
};

// ── Date window helpers ──────────────────────────────────────────────
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function isoPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateRangeFor(filter: PlanFilter): { from: string; to: string } | { lt: string } {
  const today = isoToday();
  switch (filter) {
    case 'today':    return { from: today, to: today };
    case 'tomorrow': return { from: isoTomorrow(), to: isoTomorrow() };
    case 'week':     return { from: today, to: isoPlusDays(7) };
    case 'overdue':  return { lt: today };
  }
}

// Apply the date range to a Supabase query against `<column>`.
function applyRange(q: any, col: string, range: ReturnType<typeof dateRangeFor>) {
  if ('lt' in range) return q.lt(col, range.lt);
  return q.gte(col, range.from).lte(col, range.to);
}

export function usePlan(filter: PlanFilter) {
  return useQuery({
    queryKey: ['plan', filter],
    queryFn: async (): Promise<PlanItem[]> => {
      if (!isSupabaseConfigured) return [];
      const sb = requireSupabase();
      const range = dateRangeFor(filter);
      const today = isoToday();

      const [leadsRes, actsRes, evRes, callsRes] = await Promise.all([
        // Leads with a next_call in window. Overdue → not yet contacted (no
        // status change to "done"; the followup is "done" only when the
        // user logs a call or moves the next_call forward).
        applyRange(sb.from('leads').select(COLS.leads).eq('is_deleted', false), 'next_call', range),
        applyRange(sb.from('activities').select(COLS.activities).eq('is_deleted', false), 'date', range),
        applyRange(sb.from('events').select(COLS.events).eq('is_deleted', false), 'date', range),
        // Calls are read-only history; only show today + recent (no overdue
        // semantics for them). Skip calls when filter is 'overdue'.
        filter === 'overdue'
          ? Promise.resolve({ data: [], error: null })
          : applyRange(sb.from('call_reports').select(COLS.call_reports).eq('is_deleted', false), 'call_date', range),
      ]);

      const items: PlanItem[] = [];

      (leadsRes.data || []).forEach((l: any) => items.push({
        id:        `lead_${l.id}`,
        kind:      'followup',
        title:     l.company || l.contact_name || 'Lead',
        subtitle:  l.contact_name || null,
        date:      l.next_call,
        time:      null,
        status:    (l.next_call && l.next_call < today) ? 'overdue' : 'planned',
        refTable:  'leads',
        refId:     l.id,
        accountId: l.account_id,
        phone:     l.phone,
        notes:     l.notes,
      }));

      (actsRes.data || []).forEach((a: any) => items.push({
        id:        `activity_${a.id}`,
        kind:      a.type === 'Meeting' || a.type === 'Demo' ? 'meeting' : 'task',
        title:     a.title || a.type || 'Activity',
        subtitle:  a.type || null,
        date:      a.date,
        time:      a.time,
        status:    a.status === 'Completed' ? 'done' :
                   (a.date && a.date < today) ? 'overdue' : 'planned',
        refTable:  'activities',
        refId:     a.id,
        accountId: a.account_id,
        contactId: a.contact_id,
        notes:     a.notes,
      }));

      (evRes.data || []).forEach((e: any) => items.push({
        id:        `event_${e.id}`,
        kind:      'meeting',
        title:     e.title || 'Meeting',
        subtitle:  e.location || null,
        date:      e.date,
        time:      e.time,
        status:    (e.date && e.date < today) ? 'overdue' : 'planned',
        refTable:  'events',
        refId:     e.id,
        accountId: e.account_id,
        contactId: e.contact_id,
        notes:     e.notes,
      }));

      (callsRes.data || []).forEach((c: any) => items.push({
        id:        `call_${c.id}`,
        kind:      'call',
        title:     c.lead_name || 'Call',
        subtitle:  c.call_type || null,
        date:      c.call_date,
        time:      null,
        status:    'done',  // logged calls are inherently completed
        refTable:  'call_reports',
        refId:     c.id,
        accountId: c.account_id,
        contactId: c.contact_id,
        notes:     c.notes,
      }));

      // Sort: by date asc, then time asc (no-time items at end of each day).
      return items.sort((a, b) => {
        const ad = a.date || '';
        const bd = b.date || '';
        if (ad !== bd) return ad.localeCompare(bd);
        const at = a.time || '99:99';
        const bt = b.time || '99:99';
        return at.localeCompare(bt);
      });
    },
  });
}

// ── Counts for chip badges ────────────────────────────────────────────
// Single round-trip to count items in each filter bucket. Cheaper than
// 4 full fetches; the chip bar just needs numbers.
export function usePlanCounts() {
  return useQuery({
    queryKey: ['plan-counts'],
    queryFn: async (): Promise<Record<PlanFilter, number>> => {
      if (!isSupabaseConfigured) return { today: 0, tomorrow: 0, week: 0, overdue: 0 };
      const sb = requireSupabase();
      const today = isoToday();
      const tomorrow = isoTomorrow();
      const weekEnd = isoPlusDays(7);

      // Counts ignore filter source-table boundaries — they reflect what
      // the chip would show. Each query is a HEAD-only count for cost.
      const headQ = (table: string, col: string, op: 'eq' | 'lt' | 'between', a: string, b?: string) => {
        let q: any = sb.from(table).select('id', { count: 'exact', head: true }).eq('is_deleted', false);
        if (op === 'eq') q = q.eq(col, a);
        else if (op === 'lt') q = q.lt(col, a);
        else q = q.gte(col, a).lte(col, b!);
        return q;
      };

      const [
        leadsToday, actsToday, evToday,
        leadsTom,   actsTom,   evTom,
        leadsWeek,  actsWeek,  evWeek,
        leadsOver,  actsOver,  evOver,
      ] = await Promise.all([
        headQ('leads',      'next_call', 'eq', today),
        headQ('activities', 'date',      'eq', today),
        headQ('events',     'date',      'eq', today),
        headQ('leads',      'next_call', 'eq', tomorrow),
        headQ('activities', 'date',      'eq', tomorrow),
        headQ('events',     'date',      'eq', tomorrow),
        headQ('leads',      'next_call', 'between', today, weekEnd),
        headQ('activities', 'date',      'between', today, weekEnd),
        headQ('events',     'date',      'between', today, weekEnd),
        headQ('leads',      'next_call', 'lt', today),
        headQ('activities', 'date',      'lt', today),
        headQ('events',     'date',      'lt', today),
      ]);

      return {
        today:    (leadsToday.count || 0) + (actsToday.count || 0) + (evToday.count || 0),
        tomorrow: (leadsTom.count   || 0) + (actsTom.count   || 0) + (evTom.count   || 0),
        week:     (leadsWeek.count  || 0) + (actsWeek.count  || 0) + (evWeek.count  || 0),
        overdue:  (leadsOver.count  || 0) + (actsOver.count  || 0) + (evOver.count  || 0),
      };
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark a planned activity as Completed. Only meaningful for the
 * `activities` table — leads / events use a different completion model
 * (lead = log a call + advance next_call; event = stays as-is, logging
 * an outcome is the separate "Log Call" form).
 */
export function useMarkActivityDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ activityId, outcome }: { activityId: string; outcome?: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.from('activities').update({
        status: 'Completed',
        outcome: outcome || null,
        updated_at: new Date().toISOString(),
      }).eq('id', activityId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan'] });
      qc.invalidateQueries({ queryKey: ['plan-counts'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

/**
 * Reschedule any planable item. Maps the new date onto the right column
 * for the target table.
 */
export function useReschedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, newDate, newTime }: { item: PlanItem; newDate: string; newTime?: string | null }) => {
      const sb = requireSupabase();
      const patch: any = { updated_at: new Date().toISOString() };
      if (item.refTable === 'leads')        patch.next_call = newDate;
      else if (item.refTable === 'activities') { patch.date = newDate; if (newTime !== undefined) patch.time = newTime; }
      else if (item.refTable === 'events')     { patch.date = newDate; if (newTime !== undefined) patch.time = newTime; }
      else throw new Error(`${item.refTable} can't be rescheduled`);
      const { error } = await sb.from(item.refTable).update(patch).eq('id', item.refId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan'] });
      qc.invalidateQueries({ queryKey: ['plan-counts'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

/**
 * Append a comment to the item's notes field with an ISO timestamp prefix.
 * Same convention as the web app's "add remark" pattern (PR #100 era).
 * Future PR: write to a separate `comments` table for proper threads +
 * @mentions. JSONB notes work today and avoid a schema change.
 */
export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, body, author }: { item: PlanItem; body: string; author: string }) => {
      const sb = requireSupabase();
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const line = `[${stamp}] ${author}: ${body.trim()}`;
      const next = [item.notes || '', line].filter(Boolean).join('\n');
      const { error } = await sb.from(item.refTable).update({
        notes: next, updated_at: new Date().toISOString(),
      }).eq('id', item.refId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan'] });
    },
  });
}
