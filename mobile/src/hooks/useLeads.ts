// useLeads — list + single-row + status-update + add-note.
// ─────────────────────────────────────────────────────────────────────────────
// All Leads.* operations go through this file so the list view, detail
// view, and dashboard counter share one cache. RLS on the server scopes
// rows to the caller automatically — we don't need to filter by owner
// here. The server returns only what this user is allowed to see.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/supabase';

export type Lead = {
  id: string;
  lead_id: string;
  company: string | null;
  contact_name: string | null;
  contact: string | null;       // some legacy rows used `contact`
  email: string | null;
  phone: string | null;
  designation: string | null;
  product: string | null;
  stage: string | null;
  source: string | null;
  region: string | null;
  country: string | null;
  score: number | null;
  next_call: string | null;
  last_contact_date: string | null;
  account_id: string | null;
  owner: string | null;          // mapped from assignedTo on web side
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_deleted: boolean | null;
};

const LIST_COLS = `
  id, lead_id, company, contact_name, contact, email, phone, designation,
  product, stage, source, region, country, score, next_call, last_contact_date,
  account_id, owner, notes, created_at, updated_at, is_deleted
`;

export function useLeads() {
  return useQuery({
    queryKey: ['leads'],
    queryFn: async (): Promise<Lead[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from('leads')
        .select(LIST_COLS)
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as Lead[];
    },
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: async (): Promise<Lead | null> => {
      if (!id) return null;
      const sb = requireSupabase();
      const { data, error } = await sb
        .from('leads')
        .select(LIST_COLS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as Lead | null;
    },
    enabled: !!id,
  });
}

/**
 * Patch any subset of lead columns. Optimistic update so the UI snaps
 * immediately; rolls back on error. Refetches on settle to keep dervied
 * state (e.g. dashboard counters) in sync.
 */
export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Lead> }) => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from('leads')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(LIST_COLS)
        .maybeSingle();
      if (error) throw error;
      return data as Lead;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['lead', id] });
      await qc.cancelQueries({ queryKey: ['leads'] });
      const prevList = qc.getQueryData<Lead[]>(['leads']);
      const prevOne  = qc.getQueryData<Lead | null>(['lead', id]);
      if (prevList) {
        qc.setQueryData<Lead[]>(['leads'], prevList.map(l => l.id === id ? { ...l, ...patch } : l));
      }
      if (prevOne) {
        qc.setQueryData<Lead | null>(['lead', id], { ...prevOne, ...patch });
      }
      return { prevList, prevOne };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.prevList) qc.setQueryData(['leads'], ctx.prevList);
      if (ctx?.prevOne)  qc.setQueryData(['lead', id], ctx.prevOne);
    },
    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
