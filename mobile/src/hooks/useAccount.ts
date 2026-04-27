// useAccount — single-row fetch for an account, mostly for surface info
// (address / city / country) shown alongside lead/contact records.
// ─────────────────────────────────────────────────────────────────────────────
// Kept tiny on purpose — full account CRUD lives on web for now and the
// mobile app only needs read-only access to the address fields so the Map
// button and Today visits strip can resolve a destination.

import { useQuery } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/supabase';

export type Account = {
  id: string;
  name: string;
  type: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  website: string | null;
};

const COLS = 'id, name, type, country, city, address, website';

export function useAccount(id: string | null | undefined) {
  return useQuery({
    queryKey: ['account', id],
    queryFn: async (): Promise<Account | null> => {
      if (!id) return null;
      const sb = requireSupabase();
      const { data, error } = await sb
        .from('accounts')
        .select(COLS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as Account | null;
    },
    enabled: !!id,
  });
}

/**
 * Compose the bits of an account into a single string suitable for handing
 * to Google Maps. Falls back to the account name (which Google geocodes
 * surprisingly well) when no address is stored.
 */
export function accountAddressString(acct: Account | null | undefined, fallbackCompany?: string): string {
  if (!acct) return (fallbackCompany || '').trim();
  const parts = [acct.address, acct.city, acct.country].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return acct.name || (fallbackCompany || '');
}
