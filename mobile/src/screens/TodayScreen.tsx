// TodayScreen — the home tab. The first thing the user sees on app open.
// ─────────────────────────────────────────────────────────────────────────────
// Layout (top → bottom):
//   1. Gradient header — greeting (avatar + "Hi <firstname>"), date + KPI subtitle
//   2. KPI strip — 4 small chips (Followups / Meetings / Tasks / Calls)
//   3. AGENDA section — chronological list of today's items, each row with
//      kind icon, title, subtitle, optional time, severity chip, action buttons
//      (Call / WhatsApp / Map for items that have a phone or location)
//   4. Recent activity feed — last 5 completed activities/calls
//
// The FAB is registered via useFAB() — pushes 4 quick actions to the global
// FAB at the App.tsx root.

import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Pressable,
} from 'react-native';
import {
  Phone, Users, Calendar, MessageSquare, Camera, MapPin,
  PhoneIncoming, UserPlus, ClipboardList, Navigation,
} from 'lucide-react-native';
import { useAuth } from '@/auth/AuthContext';
import {
  GradientHeader, EmptyState, SkeletonRow, SeverityChip,
  SectionHeader, useFAB, type FABAction,
} from '@/components/ui';
import { useToday, type AgendaItem } from '@/hooks/useToday';
import { useTodayVisits, type Visit } from '@/hooks/useTodayVisits';
import { callPhone, openWhatsApp, openEmail } from '@/utils/dial';
import { openMaps } from '@/utils/maps';
import { initials } from '@/utils/format';
import { colors, fontSize, fontWeight, spacing, radii } from '@/theme';

type Props = {
  onNewLead: () => void;
  onNewContact: () => void;
  onLogCall: () => void;        // Phase 2 — opens Log Call form (PR #107)
  onScanCard: () => void;       // Phase 2 — Scan Card (PR #107)
  onOpenLead: (id: string) => void;
  // Tap a KPI tile → jump to Plan tab (Phase 2 will accept a filter
  // string here so e.g. "calls" pre-filters the Plan view to today's
  // calls; the parent ignores the arg until #104 wires the chips.)
  onOpenPlan: (filter?: 'followups' | 'meetings' | 'tasks' | 'calls') => void;
};

export function TodayScreen({ onNewLead, onNewContact, onLogCall, onScanCard, onOpenLead, onOpenPlan }: Props) {
  const { profile } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useToday();
  const { data: visits = [] } = useTodayVisits();

  // Register FAB actions for this tab
  const fabActions: FABAction[] = React.useMemo(() => [
    { key: 'scan',    label: 'Scan Business Card', hint: 'Capture contact via camera',               icon: <Camera size={22} color={colors.brand}/>,         onPress: onScanCard },
    { key: 'log',     label: 'Log Call',           hint: 'Capture outcome + next action',            icon: <PhoneIncoming size={22} color={colors.brand}/>,  onPress: onLogCall },
    { key: 'lead',    label: 'New Lead',           hint: 'Quick capture from anywhere',              icon: <UserPlus size={22} color={colors.brand}/>,       onPress: onNewLead },
    { key: 'contact', label: 'New Contact',        hint: 'For an existing account',                  icon: <ClipboardList size={22} color={colors.brand}/>,  onPress: onNewContact },
  ], [onScanCard, onLogCall, onNewLead, onNewContact]);
  useFAB(fabActions);

  const greeting = profile?.name?.split(' ')[0] || 'there';
  const today = new Date();
  const dateLabel = today.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'short' });
  const counts = data?.counts;
  const subtitleParts = counts
    ? [
        counts.followups ? `${counts.followups} follow-up${counts.followups === 1 ? '' : 's'}` : null,
        counts.meetings  ? `${counts.meetings} meeting${counts.meetings === 1 ? '' : 's'}`     : null,
        counts.tasks     ? `${counts.tasks} task${counts.tasks === 1 ? '' : 's'}`              : null,
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <View style={styles.root}>
      <GradientHeader
        title={`Hi ${greeting}`}
        subtitle={`${dateLabel}${subtitleParts ? ` · ${subtitleParts}` : ''}`}
        right={
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(profile?.name)}</Text>
          </View>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={!!isRefetching} onRefresh={refetch} tintColor={colors.brand}/>}
      >
        {/* KPI strip — tucks under the gradient header (negative top margin).
            Each tile is a tappable button that jumps to the Plan tab with a
            filter hint (Phase 2). They look like compact button-cards, not
            static labels — this was a UX miss in PR #103 that the user
            flagged immediately. */}
        <View style={styles.kpiRow}>
          <Kpi
            label="Followups"
            value={counts?.followups ?? 0}
            icon={<Phone size={18} color={colors.brand}/>}
            tint={colors.brandLight}
            onPress={() => onOpenPlan('followups')}
          />
          <Kpi
            label="Meetings"
            value={counts?.meetings ?? 0}
            icon={<Users size={18} color={colors.green}/>}
            tint={colors.greenBg}
            onPress={() => onOpenPlan('meetings')}
          />
          <Kpi
            label="Tasks"
            value={counts?.tasks ?? 0}
            icon={<Calendar size={18} color={colors.amber}/>}
            tint={colors.amberBg}
            onPress={() => onOpenPlan('tasks')}
          />
          <Kpi
            label="Calls"
            value={counts?.calls ?? 0}
            icon={<MessageSquare size={18} color={colors.blue}/>}
            tint={colors.blueBg}
            onPress={() => onOpenPlan('calls')}
          />
        </View>

        {/* TODAY'S VISITS — horizontal strip of locations that resolve to a
            map pin. Each card is tappable → opens Google Maps with directions
            to that destination. Hidden when there are no visits with a
            usable address; this isn't a "coming soon" placeholder, it's
            additive content that shows up only when relevant. */}
        {visits.length > 0 ? (
          <>
            <SectionHeader title="Today's visits" count={visits.length}/>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.visitsRow}
            >
              {visits.map(v => <VisitCard key={v.id} visit={v}/>)}
            </ScrollView>
          </>
        ) : null}

        {/* TODAY'S AGENDA */}
        <SectionHeader title="Today's agenda" count={data?.agenda.length || 0}/>
        <View style={styles.agendaWrap}>
          {isLoading
            ? <View>
                <SkeletonRow/>
                <SkeletonRow/>
                <SkeletonRow/>
              </View>
            : (data?.agenda || []).length === 0
              ? <EmptyState
                  icon={<Calendar size={28} color={colors.brand}/>}
                  title="Nothing scheduled today"
                  sub="Add a follow-up, log a call, or schedule a meeting using the + button."
                  cta={{ label: '+ New lead', onPress: onNewLead }}
                />
              : (data!.agenda).map(item => (
                  <AgendaRow
                    key={item.id}
                    item={item}
                    onPress={() => item.kind === 'followup' ? onOpenLead(item.refId) : undefined}
                  />
                ))
          }
        </View>
      </ScrollView>
    </View>
  );
}

// Kpi — tappable tile with icon-in-tinted-bubble + big number + uppercase
// label. Stacked layout (icon on top, then value, then label) so all four
// tiles fit on a 375px-wide phone without truncating the labels. The earlier
// row layout squeezed each tile to ~80px wide and only the first letter
// of the label fit ("F." "M." "T." "C.") — fixed in PR #110-followup.
function Kpi({ label, value, icon, tint, onPress }: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tint: string;
  onPress?: () => void;
}) {
  const isZero = value === 0 || value === '0';
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.s3, foreground: true }}
      style={({ pressed }) => [styles.kpi, pressed && styles.kpiPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
    >
      <View style={[styles.kpiIcon, { backgroundColor: tint }]}>{icon}</View>
      <Text style={[styles.kpiValue, isZero && styles.kpiValueMuted]}>{value}</Text>
      <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// VisitCard — one stop on today's route. Tap → opens Google/Apple Maps with
// directions. Width is fixed so the strip scrolls horizontally with a
// predictable card cadence (cards aren't full-width).
function VisitCard({ visit }: { visit: Visit }) {
  return (
    <Pressable
      onPress={() => openMaps({ kind: 'address', address: visit.address })}
      style={({ pressed }) => [styles.visitCard, pressed && styles.visitCardPressed]}
      android_ripple={{ color: colors.s3 }}
    >
      <View style={styles.visitIcon}>
        <MapPin size={18} color={colors.brand}/>
      </View>
      <Text style={styles.visitTitle} numberOfLines={1}>{visit.title}</Text>
      <Text style={styles.visitAddress} numberOfLines={2}>
        {visit.address || visit.subtitle || '—'}
      </Text>
      <View style={styles.visitFootRow}>
        {visit.time ? <Text style={styles.visitTime}>{visit.time}</Text> : <View/>}
        <View style={styles.visitGoBtn}>
          <Navigation size={12} color={colors.brand}/>
          <Text style={styles.visitGoText}>Directions</Text>
        </View>
      </View>
    </Pressable>
  );
}

function AgendaRow({ item, onPress }: { item: AgendaItem; onPress?: () => void }) {
  const KIND_ICON: Record<AgendaItem['kind'], React.ReactNode> = {
    followup: <Phone size={18} color={colors.blue}/>,
    activity: <ClipboardList size={18} color={colors.purple}/>,
    event:    <Users size={18} color={colors.green}/>,
    call:     <PhoneIncoming size={18} color={colors.amber}/>,
  };
  const sev = item.status === 'overdue' ? 'overdue'
            : item.status === 'done'    ? 'done'
            : 'planned';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.agendaRow, pressed && styles.agendaRowPressed]} android_ripple={{ color: colors.s3 }}>
      <View style={styles.iconBubble}>{KIND_ICON[item.kind]}</View>
      <View style={styles.agendaBody}>
        <View style={styles.agendaTitleRow}>
          <Text style={styles.agendaTitle} numberOfLines={1}>{item.title}</Text>
          {item.time ? <Text style={styles.agendaTime}>{item.time}</Text> : null}
        </View>
        <View style={styles.agendaMetaRow}>
          {item.subtitle ? <Text style={styles.agendaSub} numberOfLines={1}>{item.subtitle}</Text> : null}
          <SeverityChip level={sev}/>
        </View>
      </View>
      {item.phone ? (
        <View style={styles.agendaActions}>
          <Pressable
            hitSlop={10}
            onPress={(e) => { e.stopPropagation(); callPhone(item.phone || ''); }}
            style={styles.iconBtn}
          >
            <Phone size={16} color={colors.brand}/>
          </Pressable>
          <Pressable
            hitSlop={10}
            onPress={(e) => { e.stopPropagation(); openWhatsApp(item.phone || '', `Hi ${item.title}`); }}
            style={styles.iconBtn}
          >
            <MessageSquare size={16} color={colors.brand}/>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },

  avatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.textInv, fontSize: fontSize.xs, fontWeight: fontWeight.bold },

  kpiRow: {
    flexDirection: 'row',
    gap: spacing.xs,                        // tighter gaps so 4 tiles breathe on 375px
    marginTop: spacing.sm,                  // sit fully below the gradient — cleaner, no clipped icons
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  // Each KPI is a self-standing tappable card. Stacked layout: icon on top,
  // big number, then label. Lets the label show in full on narrow phones.
  kpi: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: spacing.sm,
    minHeight: 84,
    // Native shadow + Android elevation
    elevation: 2,
    shadowColor: '#0D1F2D',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  kpiPressed: { opacity: 0.7 },
  kpiIcon: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.heavy,
    color: colors.text,
    lineHeight: fontSize.lg + 2,
    textAlign: 'center',
  },
  kpiValueMuted: { color: colors.text3 },   // 0-counts fade so the eye finds the active ones
  kpiLabel: {
    fontSize: 10,
    fontWeight: fontWeight.semi,
    color: colors.text3,
    marginTop: 1,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  agendaWrap: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  agendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  agendaRowPressed: { backgroundColor: colors.s2 },
  iconBubble: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.s2,
    alignItems: 'center', justifyContent: 'center',
  },
  agendaBody:  { flex: 1, minWidth: 0 },
  agendaTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  agendaTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, flex: 1 },
  agendaTime:  { fontSize: fontSize.xs, color: colors.text3, marginLeft: spacing.sm },
  agendaMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  agendaSub:   { fontSize: fontSize.xs, color: colors.text2, flex: 1 },

  agendaActions: { flexDirection: 'row', gap: spacing.xs },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },

  // Visits strip
  visitsRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  visitCard: {
    width: 200,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
    elevation: 1,
    shadowColor: '#0D1F2D',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  visitCardPressed: { opacity: 0.7 },
  visitIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  visitTitle:   { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text },
  visitAddress: { fontSize: fontSize.xs, color: colors.text2, marginTop: 4, lineHeight: 16, minHeight: 32 },
  visitFootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  visitTime:    { fontSize: 11, color: colors.text3, fontWeight: fontWeight.semi },
  visitGoBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  visitGoText:  { fontSize: 11, color: colors.brand, fontWeight: fontWeight.semi },
});
