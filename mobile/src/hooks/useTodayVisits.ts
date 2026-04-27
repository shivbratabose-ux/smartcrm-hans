// useTodayVisits — collects today's tappable destinations for the Today
// screen's "Visits" strip. PR #107.
// ─────────────────────────────────────────────────────────────────────────────
// Field reps want a one-tap path to "give me directions to the next meeting".
// We pull two sources:
//
//   1. events with date = today AND a non-empty `location` (in-person
//      meetings the user explicitly logged a venue for).
//   2. leads with next_call = today, joined to their account address.
//
// The result is a small array of `Visit` objects ready to feed the
// VisitsStrip component. Each visit knows the title, optional time, and the
// resolved address — passing the address straight to `openMaps()` opens the
// platform map app to that destination.
//
// We deliberately don't render a real map widget on Today (would need
// `react-native-maps` + a Google API key + heavy native deps). The strip is
// a horizontal row of cards, each tappable.

import { useQuery } from '@tanstack/react-query';
import { requireSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { todayIso } from '@/utils/format';

export type Visit = {
  id: string;
  source: 'event' | 'followup';
  title: string;
  time?: string | null;
  address: string;
  subtitle?: string | null;
};

export function useTodayVisits() {
  return useQuery({
    queryKey: ['today-visits'],
    queryFn: async (): Promise<Visit[]> => {
      if (!isSupabaseConfigured) return [];
      const sb = requireSupabase();
      const today = todayIso();

      // 1. Events with a location, today
      const { data: events } = await sb
        .from('events')
        .select('id, title, date, time, location, account_id')
        .eq('is_deleted', false)
        .eq('date', today)
        .not('location', 'is', null)
        .limit(20);

      // 2. Today's followups (leads.next_call = today). We pull the lead +
      //    join account so we get the address in one round-trip.
      const { data: followups } = await sb
        .from('leads')
        .select('id, company, contact_name, next_call, account_id')
        .eq('is_deleted', false)
        .eq('next_call', today)
        .limit(20);

      // Account address lookup — collect ids from both sources, batch fetch.
      const acctIds = new Set<string>();
      (events || []).forEach((e: any) => { if (e.account_id) acctIds.add(e.account_id); });
      (followups || []).forEach((l: any) => { if (l.account_id) acctIds.add(l.account_id); });

      let acctMap: Record<string, { address: string; city: string; country: string; name: string }> = {};
      if (acctIds.size > 0) {
        const { data: accts } = await sb
          .from('accounts')
          .select('id, name, address, city, country')
          .in('id', Array.from(acctIds));
        (accts || []).forEach((a: any) => {
          acctMap[a.id] = {
            name: a.name || '',
            address: a.address || '',
            city: a.city || '',
            country: a.country || '',
          };
        });
      }

      const composeAddress = (acct?: { address: string; city: string; country: string; name: string }, fallback?: string) => {
        if (!acct) return fallback || '';
        const parts = [acct.address, acct.city, acct.country].filter(Boolean);
        return parts.length ? parts.join(', ') : (acct.name || fallback || '');
      };

      const eventVisits: Visit[] = (events || []).map((e: any) => ({
        id: `e_${e.id}`,
        source: 'event',
        title: e.title || 'Meeting',
        time: e.time || null,
        // Prefer the explicit location field, then fall back to account
        // address — many users type "Customer office" rather than the full
        // street address, in which case the account address is more useful.
        address: e.location || composeAddress(acctMap[e.account_id]) || e.title,
        subtitle: e.location ? null : (acctMap[e.account_id]?.name || null),
      }));

      const followupVisits: Visit[] = (followups || [])
        .filter((l: any) => acctMap[l.account_id])      // only show when we have an address
        .map((l: any) => ({
          id: `f_${l.id}`,
          source: 'followup',
          title: l.company || l.contact_name || 'Lead',
          time: null,
          address: composeAddress(acctMap[l.account_id], l.company),
          subtitle: l.contact_name || null,
        }));

      // Sort by time (events first when they have one), then by title.
      const all = [...eventVisits, ...followupVisits];
      all.sort((a, b) => {
        const at = a.time || '99:99';
        const bt = b.time || '99:99';
        if (at !== bt) return at.localeCompare(bt);
        return (a.title || '').localeCompare(b.title || '');
      });
      return all;
    },
  });
}
