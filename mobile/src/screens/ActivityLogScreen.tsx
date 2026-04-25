import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Phone, Users, FileText, Mail } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radii, fontSize } from '@/theme';
import { useActivities, type Activity } from '@/hooks/useActivities';
import { fmtRelativeDate, todayIso } from '@/utils/format';

const TYPE_ICON: Record<string, React.ReactNode> = {
  Call: <Phone size={16} color={colors.blue}/>,
  Telephone: <Phone size={16} color={colors.blue}/>,
  Meeting: <Users size={16} color={colors.green}/>,
  Demo: <Users size={16} color={colors.purple}/>,
  Email: <Mail size={16} color={colors.amber}/>,
};

export function ActivityLogScreen() {
  const { data, isLoading, refetch, isRefetching } = useActivities();

  const sections = useMemo(() => {
    const today = todayIso();
    const todays  = (data || []).filter(a => (a.date || '').slice(0, 10) === today);
    const pending = (data || []).filter(a => a.status === 'Planned');
    const recent  = (data || []).filter(a => a.status !== 'Planned' && (a.date || '').slice(0, 10) !== today).slice(0, 100);
    return { todays, pending, recent };
  }, [data]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.subtitle}>Today's calls + pending follow-ups</Text>
      </View>

      <FlatList
        data={[
          { _section: "TODAY" } as any,
          ...sections.todays,
          { _section: "PENDING" } as any,
          ...sections.pending,
          { _section: "RECENT" } as any,
          ...sections.recent,
        ]}
        keyExtractor={(item: any, i) => item._section ? `s_${item._section}_${i}` : item.id}
        renderItem={({ item }) => {
          if ((item as any)._section) {
            const label = (item as any)._section as string;
            return (
              <Text style={styles.sectionLabel}>
                {label === 'TODAY'   ? `Today (${sections.todays.length})`
                 : label === 'PENDING' ? `Pending (${sections.pending.length})`
                 : `Recent (${sections.recent.length})`}
              </Text>
            );
          }
          return <ActivityRow a={item as Activity}/>;
        }}
        refreshControl={<RefreshControl refreshing={!!isRefetching} onRefresh={refetch} tintColor={colors.brand}/>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{isLoading ? 'Loading…' : 'No activity yet.'}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function ActivityRow({ a }: { a: Activity }) {
  const icon = TYPE_ICON[a.type] || <FileText size={16} color={colors.text3}/>;
  const planned = a.status === 'Planned';
  return (
    <View style={styles.row}>
      <View style={[styles.iconBubble, planned && { backgroundColor: colors.amberBg }]}>{icon}</View>
      <View style={styles.body}>
        <Text style={styles.rowTitle} numberOfLines={1}>{a.title || a.type}</Text>
        <View style={styles.rowMeta}>
          <Text style={styles.metaText}>{a.type}</Text>
          {a.outcome ? <Text style={styles.metaText}>· {a.outcome}</Text> : null}
          <Text style={[styles.metaText, planned && { color: colors.amber, fontWeight: '700' }]}>· {fmtRelativeDate(a.date)}</Text>
        </View>
        {a.notes ? <Text style={styles.notes} numberOfLines={2}>{a.notes}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.text3, marginTop: 2 },

  sectionLabel: {
    fontSize: fontSize.xs, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase',
    color: colors.text3,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.md,
  },
  iconBubble: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.s2,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1 },
  rowTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2, gap: spacing.xs },
  metaText: { fontSize: fontSize.xs, color: colors.text3 },
  notes: { fontSize: fontSize.sm, color: colors.text2, marginTop: 4 },

  empty: { padding: spacing.xxl, alignItems: 'center' },
  emptyText: { color: colors.text3, fontSize: fontSize.sm },
});
