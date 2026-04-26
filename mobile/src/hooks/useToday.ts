// useToday — chronological agenda + KPI counts for the Today screen.
// ─────────────────────────────────────────────────────────────────────────────
// Pulls everything the Today tab needs in ONE round-trip cluster (parallel
// Supabase calls). Falls back to empty arrays when offline / not configured
// so the screen renders cleanly even before the user is signed in or while
// the cache is warming.
//
// Returns the union of:
//   - leads with next_call = today (followups due)
//   - activities with date = today + status in ('Planned', 'Completed')
//   - events with date = today
//   - call_reports with call_date = today
//
// Each item is normalised to an `AgendaItem` so the UI can render one
// uniform list sorted by time.

import { useQuery } from '@tanstack/react-query';
import { requireSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { todayIso } from '@/utils/format';

export type AgendaItem = {
  id: string;
  kind: 'followup' | 'activity' | 'event' | 'call';
  title: string;
  subtitle?: string;
  time?: string;            // "09:30" if known, else null
  status: 'planned' | 'done' | 'overdue';
  refTable: 'leads' | 'activities' | 'events' | 'call_reports';
  refId: string;
  accountId?: string | null;
  contactId?: string | null;
  phone?: string | null;
};

export type TodayData = {
  agenda: AgendaItem[];
  counts: {
    followups: number;
    meetings:  number;
    tasks:     number;
    calls:     number;
    overdue:   number;
  };
};

export function useToday() {
  return useQuery({
    queryKey: ['today'],
    queryFn: async (): Promise<TodayData> => {
      if (!isSupabaseConfigured) {
        return EMPTY;
      }
      const sb = requireSupabase();
      const today = todayIso();

      // 4 parallel queries, scoped by RLS to current user
      const [followupsRes, activitiesRes, eventsRes, callsRes] = await Promise.all([
        sb.from('leads')
          .select('id, lead_id, company, contact_name, phone, next_call, account_id')
          .eq('is_deleted', false)
          .eq('next_call', today)
          .limit(50),
        sb.from('activities')
          .select('id, type, status, title, date, time, account_id, contact_id')
          .eq('is_deleted', false)
          .eq('date', today)
          .limit(50),
        sb.from('events')
          .select('id, title, date, time, location, account_id, contact_id')
          .eq('is_deleted', false)
          .eq('date', today)
          .limit(50),
        sb.from('call_reports')
          .select('id, call_type, call_date, lead_name, account_id, contact_id, outcome')
          .eq('is_deleted', false)
          .eq('call_date', today)
          .limit(50),
      ]);

      const followups: AgendaItem[] = (followupsRes.data || []).map((l: any) => ({
        id: `f_${l.id}`,
        kind: 'followup',
        title: l.company || l.contact_name || 'Lead',
        subtitle: l.contact_name || undefined,
        status: 'planned',
        refTable: 'leads',
        refId: l.id,
        accountId: l.account_id,
        phone: l.phone,
      }));
      const activities: AgendaItem[] = (activitiesRes.data || []).map((a: any) => ({
        id: `a_${a.id}`,
        kind: 'activity',
        title: a.title || a.type || 'Activity',
        subtitle: a.type || undefined,
        time: a.time || undefined,
        status: a.status === 'Completed' ? 'done' : 'planned',
        refTable: 'activities',
        refId: a.id,
        accountId: a.account_id,
        contactId: a.contact_id,
      }));
      const events: AgendaItem[] = (eventsRes.data || []).map((e: any) => ({
        id: `e_${e.id}`,
        kind: 'event',
        title: e.title || 'Meeting',
        subtitle: e.location || undefined,
        time: e.time || undefined,
        status: 'planned',
        refTable: 'events',
        refId: e.id,
        accountId: e.account_id,
        contactId: e.contact_id,
      }));
      const calls: AgendaItem[] = (callsRes.data || []).map((c: any) => ({
        id: `c_${c.id}`,
        kind: 'call',
        title: c.lead_name || 'Call',
        subtitle: c.call_type || undefined,
        status: c.outcome ? 'done' : 'planned',
        refTable: 'call_reports',
        refId: c.id,
        accountId: c.account_id,
        contactId: c.contact_id,
      }));

      // Sort: items with a time first (chronological), then no-time items at end.
      const agenda = [...followups, ...activities, ...events, ...calls].sort((a, b) => {
        const at = a.time || '99:99';
        const bt = b.time || '99:99';
        return at.localeCompare(bt);
      });

      return {
        agenda,
        counts: {
          followups: followups.length,
          meetings:  events.length,
          tasks:     activities.filter(a => a.status === 'planned').length,
          calls:     calls.length,
          overdue:   0, // computed in a separate query in PR #104 (Plan tab)
        },
      };
    },
  });
}

const EMPTY: TodayData = {
  agenda: [],
  counts: { followups: 0, meetings: 0, tasks: 0, calls: 0, overdue: 0 },
};
