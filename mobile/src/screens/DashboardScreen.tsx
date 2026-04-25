import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Pressable,
} from 'react-native';
import { Phone, MessageSquare, UserPlus, Calendar } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radii, fontSize } from '@/theme';
import { KpiCard } from '@/components/KpiCard';
import { useDashboardCounts } from '@/hooks/useActivities';
import { useAuth } from '@/auth/AuthContext';

type DashboardProps = {
  onGoLeads: () => void;
  onGoActivity: () => void;
  onNewLead: () => void;
  onNewContact: () => void;
};

export function DashboardScreen({ onGoLeads, onGoActivity, onNewLead, onNewContact }: DashboardProps) {
  const { profile } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useDashboardCounts();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={!!isRefetching} onRefresh={refetch} tintColor={colors.brand}/>
        }
      >
        {/* ── Greeting strip ── */}
        <View style={styles.greetWrap}>
          <View>
            <Text style={styles.greet}>Hi, {profile?.name?.split(' ')[0] || 'there'}</Text>
            <Text style={styles.greetSub}>
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'short' })}
            </Text>
          </View>
        </View>

        {/* ── KPI grid ── */}
        <View style={styles.kpiGrid}>
          <KpiCard
            label="Today's follow-ups"
            value={isLoading ? '…' : data?.todaysFollowups ?? 0}
            tint="brand"
            onPress={onGoLeads}
          />
          <KpiCard
            label="New leads today"
            value={isLoading ? '…' : data?.newLeadsToday ?? 0}
            tint="blue"
            onPress={onGoLeads}
          />
          <KpiCard
            label="Pending tasks"
            value={isLoading ? '…' : data?.pendingTasks ?? 0}
            tint="amber"
            onPress={onGoActivity}
          />
          <KpiCard
            label="Upcoming meetings"
            value={isLoading ? '…' : data?.upcomingMeetings ?? 0}
            tint="green"
            onPress={onGoActivity}
          />
        </View>

        {/* ── Quick actions ── */}
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.actionsGrid}>
          <ActionTile icon={<UserPlus  size={22} color={colors.brand}/>}    label="New Lead"    onPress={onNewLead}/>
          <ActionTile icon={<Phone     size={22} color={colors.brand}/>}    label="Add Contact" onPress={onNewContact}/>
          <ActionTile icon={<MessageSquare size={22} color={colors.brand}/>} label="Log Call"   onPress={onGoActivity}/>
          <ActionTile icon={<Calendar  size={22} color={colors.brand}/>}    label="Today"       onPress={onGoActivity}/>
        </View>

        <View style={{ height: spacing.xxl }}/>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionTile({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.action} onPress={onPress}>
      <View style={styles.actionIcon}>{icon}</View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxl },
  greetWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  greet: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  greetSub: { fontSize: fontSize.sm, color: colors.text3, marginTop: 2 },

  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },

  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xxl,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  action: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'flex-start',
    minHeight: 96,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 40, height: 40, borderRadius: radii.md,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
  },
});
