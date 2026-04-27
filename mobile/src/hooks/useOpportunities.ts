// useOpportunities — list + grouped-by-stage + stage-update for the Pipeline tab.
// ─────────────────────────────────────────────────────────────────────────────
// The web app keeps the editable stage list on `app_settings.masters.stages`
// so Masters → Pipeline Stages can rename / reorder them. The mobile
// Pipeline tab honors the same source of truth — otherwise renamed stages
// would render as "unknown" columns and the user couldn't move deals out of
// them.
//
// Hooks exposed:
//   - useStageList()      → ordered list of stage objects (name + color +
//                           probability + kind: open/won/lost). Falls back
//                           to bundled defaults when masters slot is missing.
//   - useOpportunities()  → all open opps grouped by stage NAME so columns
//                           map directly to keys + per-stage count/value totals.
//   - useUpdateOppStage() → optimistic mutation for stage moves.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, isSupabaseConfigured } from '@/lib/supabase';

export type Opportunity = {
  id: string;
  account_id: string | null;
  title: string;
  products: string[] | null;
  stage: string;
  value: number | null;
  probability: number | null;
  owner: string | null;
  close_date: string | null;
  next_step: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type Stage = {
  name: string;
  probability: number;
  color: string;
  kind: 'open' | 'won' | 'lost';
};

export type GroupedOpps = {
  stages: Stage[];
  byStage: Record<string, Opportunity[]>;
  totalsByStage: Record<string, { count: number; value: number }>;
};

const COLS = `
  id, account_id, title, products, stage, value, probability, owner,
  close_date, next_step, notes, created_at, updated_at
`;

// Fallback list when masters.stages isn't in app_settings yet (fresh
// install / RLS-blocked). Mirrors src/data/constants.js.
export const DEFAULT_STAGES: Stage[] = [
  { name: 'Prospect',    probability: 10,  color: '#94A3B8', kind: 'open' },
  { name: 'Qualified',   probability: 25,  color: '#3B82F6', kind: 'open' },
  { name: 'Demo',        probability: 45,  color: '#8B5CF6', kind: 'open' },
  { name: 'Proposal',    probability: 60,  color: '#F59E0B', kind: 'open' },
  { name: 'Negotiation', probability: 80,  color: '#F97316', kind: 'open' },
  { name: 'Won',         probability: 100, color: '#22C55E', kind: 'won'  },
  { name: 'Lost',        probability: 0,   color: '#EF4444', kind: 'lost' },
];

// Pulls `masters.stages` from app_settings (single-row JSONB blob set by
// the web app's Masters page). Returns the list in declared order.
export function useStageList() {
  return useQuery({
    queryKey: ['stage-list'],
    queryFn: async (): Promise<Stage[]> => {
      if (!isSupabaseConfigured) return DEFAULT_STAGES;
      const sb = requireSupabase();
      try {
        const { data } = await sb
          .from('app_settings')
          .select('value')
          .eq('key', 'masters')
          .maybeSingle();
        const stagesArr = (data?.value as any)?.stages;
        if (!Array.isArray(stagesArr) || stagesArr.length === 0) return DEFAULT_STAGES;
        return stagesArr.map((s: any) => ({
          name: s.name,
          probability: Number(s.probability) || 0,
          color: s.color || '#94A3B8',
          kind: (s.kind === 'won' || s.kind === 'lost') ? s.kind : 'open',
        }));
      } catch {
        // app_settings might not be readable from mobile — fall back
        // to defaults so the screen still renders.
        return DEFAULT_STAGES;
      }
    },
    staleTime: 5 * 60 * 1000,         // stages don't change often
  });
}

export function useOpportunities() {
  const stages = useStageList();

  return useQuery({
    queryKey: ['opportunities', stages.data?.map(s => s.name).join('|') || ''],
    queryFn: async (): Promise<GroupedOpps> => {
      const fallback: GroupedOpps = {
        stages: stages.data || DEFAULT_STAGES,
        byStage: {}, totalsByStage: {},
      };
      if (!isSupabaseConfigured) return fallback;
      const sb = requireSupabase();
      const { data, error } = await sb
        .from('opportunities')
        .select(COLS)
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      const opps = (data || []) as Opportunity[];
      const stageList = stages.data || DEFAULT_STAGES;
      const byStage: Record<string, Opportunity[]> = {};
      const totalsByStage: Record<string, { count: number; value: number }> = {};
      stageList.forEach(s => {
        byStage[s.name] = [];
        totalsByStage[s.name] = { count: 0, value: 0 };
      });
      opps.forEach(o => {
        const s = o.stage || stageList[0].name;
        if (!byStage[s]) {
          // Stage exists on opp but not in master list (renamed/removed).
          // Surface it in its own bucket so the data isn't lost.
          byStage[s] = [];
          totalsByStage[s] = { count: 0, value: 0 };
        }
        byStage[s].push(o);
        totalsByStage[s].count += 1;
        totalsByStage[s].value += Number(o.value) || 0;
      });
      return { stages: stageList, byStage, totalsByStage };
    },
    enabled: !stages.isLoading,
  });
}

export function useUpdateOppStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage, probability }: { id: string; stage: string; probability?: number }) => {
      const sb = requireSupabase();
      const patch: Record<string, any> = {
        stage,
        updated_at: new Date().toISOString(),
      };
      if (typeof probability === 'number') patch.probability = probability;
      const { error } = await sb.from('opportunities').update(patch).eq('id', id);
      if (error) throw error;
    },
    // Optimistic — flip the card immediately so the swipe feels instant.
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: ['opportunities'] });
      const prev = qc.getQueriesData<GroupedOpps>({ queryKey: ['opportunities'] });
      prev.forEach(([key, data]) => {
        if (!data) return;
        const next: GroupedOpps = {
          ...data,
          byStage: { ...data.byStage },
          totalsByStage: { ...data.totalsByStage },
        };
        // Find + remove the moved opp from its old column.
        let moved: Opportunity | null = null;
        Object.keys(next.byStage).forEach(stageName => {
          const idx = next.byStage[stageName].findIndex(o => o.id === id);
          if (idx >= 0) {
            moved = { ...next.byStage[stageName][idx], stage };
            next.byStage[stageName] = next.byStage[stageName].filter(o => o.id !== id);
            next.totalsByStage[stageName] = {
              count: Math.max(0, next.totalsByStage[stageName].count - 1),
              value: Math.max(0, next.totalsByStage[stageName].value - (Number(moved.value) || 0)),
            };
          }
        });
        if (moved) {
          next.byStage[stage] = [moved, ...(next.byStage[stage] || [])];
          next.totalsByStage[stage] = {
            count: (next.totalsByStage[stage]?.count || 0) + 1,
            value: (next.totalsByStage[stage]?.value || 0) + (Number(moved.value) || 0),
          };
        }
        qc.setQueryData(key, next);
      });
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      // Roll back any optimistic state on failure.
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      qc.invalidateQueries({ queryKey: ['opps-count'] });
    },
  });
}
