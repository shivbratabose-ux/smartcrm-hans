import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/supabase';

export type Contact = {
  id: string;
  contact_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  department: string | null;
  account_id: string | null;
  primary: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  is_deleted: boolean | null;
};

const COLS = `id, contact_id, name, email, phone, designation, department,
              account_id, primary, created_at, updated_at, is_deleted`;

export function useContacts() {
  return useQuery({
    queryKey: ['contacts'],
    queryFn: async (): Promise<Contact[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from('contacts')
        .select(COLS)
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as Contact[];
    },
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Contact>) => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from('contacts')
        .insert({
          ...input,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select(COLS)
        .maybeSingle();
      if (error) throw error;
      return data as Contact;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
