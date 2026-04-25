// useActivities — daily call report + meetings + pending follow-ups.
// The web app stores activities in two tables: `activities` (meetings, demos)
// and `call_reports` (telephone calls with their own structure). The Activity
// Log screen unions both for the day-view.

import { useQuery } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/supabase';
import { todayIso } from '@/utils/format';

export type Activity = {
  id: string;
  type: string;
  status: string;
  title: string | null;
  date: string | null;
  time: string | null;
  account_id: string | null;
  contact_id: string | null;
  opp_id: string | null;
  notes: string | null;
  outcome: string | null;
  owner: string | null;
  source: 'activity' | 'call_report';
};

export function useActivities() {
  return useQuery({
    queryKey: ['activities'],
    queryFn: async (): Promise<Activity[]> => {
      const sb = requireSupabase();
      const [actRes, crRes] = await Promise.all([
        sb.from('activities')
          .select('id, type, status, title, date, time, account_id, contact_id, opp_id, notes, outcome, owner')
          .eq('is_deleted', false)
          .order('date', { ascending: false })
          .limit(200),
        sb.from('call_reports')
          .select('id, call_type, lead_stage, lead_name, account_id, contact_id, call_date, outcome, notes, marketing_person')
          .eq('is_deleted', false)
          .order('call_date', { ascending: false })
          .limit(200),
      ]);
      if (actRes.error) throw actRes.error;
      if (crRes.error)  throw crRes.error;

      const activities: Activity[] = (actRes.data || []).map((a: any) => ({
        id: a.id,
        type: a.type || 'Activity',
        status: a.status || '',
        title: a.title,
        date: a.date,
        time: a.time,
        account_id: a.account_id,
        contact_id: a.contact_id,
        opp_id: a.opp_id,
        notes: a.notes,
        outcome: a.outcome,
        owner: a.owner,
        source: 'activity',
      }));
      const calls: Activity[] = (crRes.data || []).map((c: any) => ({
        id: c.id,
        type: c.call_type || 'Call',
        status: c.lead_stage || '',
        title: c.lead_name || 'Call',
        date: c.call_date,
        time: null,
        account_id: c.account_id,
        contact_id: c.contact_id,
        opp_id: null,
        notes: c.notes,
        outcome: c.outcome,
        owner: c.marketing_person,
        source: 'call_report',
      }));
      return [...activities, ...calls].sort((a, b) =>
        (b.date || '').localeCompare(a.date || '')
      );
    },
  });
}

/**
 * Aggregated counts for the Dashboard tiles. Queries are run in parallel
 * and cached under their own key so changing one doesn't refetch others.
 */
export function useDashboardCounts() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const sb = requireSupabase();
      const today = todayIso();
      const [followups, newLeads, tasks, meetings] = await Promise.all([
        sb.from('leads').select('id', { count: 'exact', head: true })
          .eq('is_deleted', false).eq('next_call', today),
        sb.from('leads').select('id', { count: 'exact', head: true })
          .eq('is_deleted', false).gte('created_at', `${today}T00:00:00`),
        sb.from('activities').select('id', { count: 'exact', head: true })
          .eq('is_deleted', false).eq('status', 'Planned').lte('date', today),
        sb.from('events').select('id', { count: 'exact', head: true })
          .eq('is_deleted', false).gte('date', today).limit(1000),
      ]);
      return {
        todaysFollowups: followups.count || 0,
        newLeadsToday:   newLeads.count || 0,
        pendingTasks:    tasks.count || 0,
        upcomingMeetings: meetings.count || 0,
      };
    },
  });
}
