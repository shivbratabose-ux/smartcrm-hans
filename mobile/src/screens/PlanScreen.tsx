// PlanScreen — STUB. Real implementation lands in PR #104.
// Today: shows the existing Activity Log content (no longer reachable from
// a tab, so we surface it here) + a "Coming soon" banner for the
// chronological Today/Tomorrow/This Week chip view.
import React from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Calendar, Sparkles } from 'lucide-react-native';
import {
  GradientHeader, EmptyState, Card, SectionHeader,
} from '@/components/ui';
import { useActivities } from '@/hooks/useActivities';
import { fmtRelativeDate, todayIso } from '@/utils/format';
import { colors, fontSize, fontWeight, spacing, radii } from '@/theme';

export function PlanScreen() {
  const { data, isLoading, refetch, isRefetching } = useActivities();

  const today = todayIso();
  const todays  = (data || []).filter(a => (a.date || '').slice(0, 10) === today);
  const upcoming = (data || []).filter(a => (a.date || '').slice(0, 10) > today).slice(0, 30);
  const recent  = (data || []).filter(a => (a.date || '').slice(0, 10) < today && a.status !== 'Planned').slice(0, 30);

  return (
    <View style={styles.root}>
      <GradientHeader
        title="Plan"
        subtitle="Today · Upcoming · Recent"
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={!!isRefetching} onRefresh={refetch} tintColor={colors.brand}/>}
      >
        {/* "Coming soon" hint pointing at PR #104 */}
        <Card style={styles.banner} flat={false} padding="md">
          <View style={styles.bannerRow}>
            <Sparkles size={18} color={colors.brand}/>
            <Text style={styles.bannerText}>
              Day / Week / Overdue chips, drag-to-reschedule and push reminders ship in PR #104.
            </Text>
          </View>
        </Card>

        <SectionHeader title="Today" count={todays.length}/>
        {todays.length === 0
          ? <View style={styles.emptyMini}><Text style={styles.emptyText}>Nothing scheduled today.</Text></View>
          : todays.map(a => <ActRow key={a.id} act={a}/>)
        }

        <SectionHeader title="Upcoming" count={upcoming.length}/>
        {upcoming.length === 0
          ? <View style={styles.emptyMini}><Text style={styles.emptyText}>Nothing planned beyond today.</Text></View>
          : upcoming.map(a => <ActRow key={a.id} act={a}/>)
        }

        <SectionHeader title="Recently completed" count={recent.length}/>
        {recent.length === 0 && !isLoading
          ? <EmptyState
              icon={<Calendar size={28} color={colors.brand}/>}
              title="No activity yet"
              sub="Logged calls and completed meetings will appear here."
            />
          : recent.map(a => <ActRow key={a.id} act={a}/>)
        }
      </ScrollView>
    </View>
  );
}

function ActRow({ act }: { act: any }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{act.title || act.type}</Text>
        <Text style={styles.rowMeta}>
          {act.type}{act.outcome ? ` · ${act.outcome}` : ''} · {fmtRelativeDate(act.date)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  banner: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.brandLight, borderColor: colors.brand + '33' },
  bannerRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  bannerText: { color: colors.text2, fontSize: fontSize.sm, flex: 1, lineHeight: 18 },

  emptyMini: { padding: spacing.lg, marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  emptyText: { color: colors.text3, fontSize: fontSize.sm, textAlign: 'center' },

  row: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    marginBottom: 1,
  },
  rowTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semi, color: colors.text },
  rowMeta:  { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
});
