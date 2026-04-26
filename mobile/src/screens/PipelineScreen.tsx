// PipelineScreen — STUB. Real horizontal-Kanban implementation lands in PR #107.
// Today: shows a simple placeholder with what's coming, plus a count of
// open opportunities so the screen isn't completely empty.
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { TrendingUp, Sparkles } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { GradientHeader, Card, EmptyState } from '@/components/ui';
import { requireSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { colors, fontSize, fontWeight, spacing, radii } from '@/theme';

function useOppsCount() {
  return useQuery({
    queryKey: ['opps-count'],
    queryFn: async () => {
      if (!isSupabaseConfigured) return 0;
      const sb = requireSupabase();
      const { count } = await sb
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('is_deleted', false)
        .not('stage', 'in', '("Won","Lost")');
      return count || 0;
    },
  });
}

export function PipelineScreen() {
  const { data: oppCount } = useOppsCount();

  return (
    <View style={styles.root}>
      <GradientHeader
        title="Pipeline"
        subtitle="Deals across stages"
      />

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Card padding="lg" style={styles.banner}>
          <View style={styles.bannerHead}>
            <Sparkles size={20} color={colors.brand}/>
            <Text style={styles.bannerTitle}>Coming in PR #107</Text>
          </View>
          <Text style={styles.bannerBody}>
            Horizontal-swipe Kanban board · swipe deals between stages · stage-advance with auto-prompt for outcome notes · linked quotes & contracts.
          </Text>
        </Card>

        <View style={{ height: spacing.xl }}/>

        <EmptyState
          icon={<TrendingUp size={28} color={colors.brand}/>}
          title={oppCount ? `${oppCount} active deal${oppCount === 1 ? '' : 's'}` : 'No active deals yet'}
          sub={oppCount
            ? 'Deal cards will render here once Pipeline ships.'
            : 'Once leads convert to deals, they appear here grouped by stage.'}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  banner: { backgroundColor: colors.brandLight, borderColor: colors.brand + '33' },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  bannerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  bannerBody:  { fontSize: fontSize.sm, color: colors.text2, lineHeight: 20 },
});
