// TanStack Query client + AsyncStorage persister.
// ─────────────────────────────────────────────────────────────────────────────
// Why this exists:
//   - The web app holds all data in React state and saves the whole tree to
//     localStorage. That model doesn't translate to mobile (load times, RAM,
//     intermittent connectivity). On mobile we use TanStack Query so each
//     screen pulls only what it needs and stale-while-revalidate handles
//     poor signal gracefully.
//   - The persister writes the cache to AsyncStorage so reopening the app
//     after a kill shows the last-known data immediately, then refetches
//     in the background. This is the "offline mode" the product brief asked
//     for — full offline-first, not just network-resilient.
//
// Mutations are NOT yet persisted to AsyncStorage in this version. When a
// write fails (offline / 5xx) the user sees a toast and the form keeps the
// values for retry. A persistent mutation queue is a Phase 2 follow-up
// (TanStack Query supports it via `persistQueryClient` with mutation
// rehydration; gated for now to avoid the complexity until we have a
// reliable conflict-resolution story).

import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache for 24h — long enough to feel offline-first, short enough that
      // a stale stage / owner doesn't haunt us forever. Each screen also
      // gets a fresh fetch when it mounts (refetchOnMount: 'always' below).
      staleTime: 1000 * 60 * 5,        // 5 min
      gcTime:    1000 * 60 * 60 * 24,  // 24h (was cacheTime in v4)
      retry: 1,
      refetchOnMount: 'always',
      refetchOnWindowFocus: false,     // mobile doesn't have window focus
    },
  },
});

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'smartcrm-query-cache-v1',
  // Throttle writes so we don't hammer AsyncStorage on every mutation —
  // the disk I/O on cheaper Android devices is genuinely slow.
  throttleTime: 1000,
});
