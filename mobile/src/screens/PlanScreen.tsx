// PlanScreen v2 — chip-filtered planner with tap-to-comment + long-press
// action sheet. Replaces the PR #103 stub with the real implementation.
// ─────────────────────────────────────────────────────────────────────────────
// Layout:
//   GradientHeader
//     ChipBar          (Today / Tomorrow / This Week / Overdue)
//     FlatList
//       PlanRow        (icon, title, time, severity chip, action buttons)
//         tap          → BottomSheet with details + comment composer
//         long-press   → BottomSheet with action list (Reschedule / Mark Done / Delete)
//
// Route param: { filter?: 'today' | 'tomorrow' | 'week' | 'overdue' }
// Deep-linked from Today screen's KPI tiles (PR #104 wired this).

import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl, Pressable, TextInput, Platform,
  Alert,
} from 'react-native';
import {
  Phone, Users, Calendar as CalendarIcon, MessageSquare, ClipboardList,
  Check, RotateCcw, Trash2, MapPin, ChevronRight, Send, X,
} from 'lucide-react-native';
import {
  GradientHeader, EmptyState, SkeletonRow, SeverityChip,
  BottomSheet, ChipBar, type ChipOption,
} from '@/components/ui';
import {
  usePlan, usePlanCounts, useMarkActivityDone, useReschedule, useAddComment,
  type PlanFilter, type PlanItem,
} from '@/hooks/usePlan';
import { callPhone, openWhatsApp } from '@/utils/dial';
import { fmtRelativeDate } from '@/utils/format';
import { useAuth } from '@/auth/AuthContext';
import { colors, fontSize, fontWeight, spacing, radii, severity } from '@/theme';

// Optional route prop — when the user lands here from a Today KPI tile,
// the filter param tells us which chip to pre-select.
type Props = {
  initialFilter?: PlanFilter;
};

const CHIPS: ChipOption<PlanFilter>[] = [
  { value: 'today',    label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week',     label: 'This Week' },
  { value: 'overdue',  label: 'Overdue' },
];

export function PlanScreen({ initialFilter = 'today' }: Props) {
  const [filter, setFilter] = useState<PlanFilter>(initialFilter);
  const { data: items = [], isLoading, refetch, isRefetching } = usePlan(filter);
  const { data: counts } = usePlanCounts();

  // The active item drives both sheets. Two flags so the sheets can be
  // distinguished (tap vs long-press) for UX clarity.
  const [activeItem, setActiveItem] = useState<PlanItem | null>(null);
  const [sheetMode, setSheetMode] = useState<'detail' | 'actions' | null>(null);

  const closeSheet = useCallback(() => { setActiveItem(null); setSheetMode(null); }, []);

  const chipOptions: ChipOption<PlanFilter>[] = CHIPS.map(c => ({
    ...c,
    badge: counts?.[c.value] ?? null,
  }));

  return (
    <View style={styles.root}>
      <GradientHeader title="Plan" subtitle="Your day · week · overdue"/>

      <View style={styles.chipsWrap}>
        <ChipBar options={chipOptions} value={filter} onChange={setFilter}/>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => (
          <PlanRow
            item={item}
            onTap={()       => { setActiveItem(item); setSheetMode('detail'); }}
            onLongPress={() => { setActiveItem(item); setSheetMode('actions'); }}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={!!isRefetching} onRefresh={refetch} tintColor={colors.brand}/>}
        ListEmptyComponent={
          isLoading
            ? <View style={styles.skeletonWrap}>
                <SkeletonRow/>
                <SkeletonRow/>
                <SkeletonRow/>
              </View>
            : <EmptyState
                icon={<CalendarIcon size={28} color={colors.brand}/>}
                title={
                  filter === 'today'    ? 'Nothing scheduled today'
                  : filter === 'tomorrow' ? 'Nothing scheduled tomorrow'
                  : filter === 'week'   ? 'Clear week ahead'
                  : 'No overdue items — nice.'
                }
                sub={
                  filter === 'overdue'
                    ? "When you fall behind on a follow-up or meeting, it'll show up here."
                    : "Use the + button to add a follow-up, log a call, or schedule a meeting."
                }
              />
        }
      />

      {/* Detail sheet — opens on TAP. Shows item details + comment composer. */}
      {activeItem && sheetMode === 'detail' && (
        <DetailSheet item={activeItem} onClose={closeSheet} onSwitchToActions={() => setSheetMode('actions')}/>
      )}

      {/* Action sheet — opens on LONG-PRESS. Vertical list of one-tap actions. */}
      {activeItem && sheetMode === 'actions' && (
        <ActionSheet item={activeItem} onClose={closeSheet}/>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlanRow — single list item
// ─────────────────────────────────────────────────────────────────────────────
function PlanRow({ item, onTap, onLongPress }: { item: PlanItem; onTap: () => void; onLongPress: () => void }) {
  const KIND_ICON: Record<PlanItem['kind'], React.ReactNode> = {
    followup: <Phone        size={18} color={colors.blue}/>,
    task:     <ClipboardList size={18} color={colors.amber}/>,
    meeting:  <Users        size={18} color={colors.green}/>,
    call:     <MessageSquare size={18} color={colors.purple}/>,
  };
  const sev = item.status;

  return (
    <Pressable
      onPress={onTap}
      onLongPress={onLongPress}
      android_ripple={{ color: colors.s3 }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityHint="Tap to open · long-press for actions"
    >
      <View style={styles.rowIcon}>{KIND_ICON[item.kind]}</View>
      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
          {item.time ? <Text style={styles.rowTime}>{item.time}</Text> : null}
        </View>
        <View style={styles.rowMeta}>
          {item.subtitle ? <Text style={styles.rowSub} numberOfLines={1}>{item.subtitle}</Text> : null}
          <SeverityChip level={sev}/>
        </View>
        {item.date ? <Text style={styles.rowDate}>{fmtRelativeDate(item.date)}</Text> : null}
      </View>
      {item.phone ? (
        <Pressable
          hitSlop={10}
          onPress={(e) => { e.stopPropagation(); callPhone(item.phone || ''); }}
          style={styles.iconBtn}
          accessibilityLabel="Call"
        >
          <Phone size={16} color={colors.brand}/>
        </Pressable>
      ) : (
        <ChevronRight size={18} color={colors.text3}/>
      )}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DetailSheet — TAP → BottomSheet with comment composer
// ─────────────────────────────────────────────────────────────────────────────
function DetailSheet({ item, onClose, onSwitchToActions }: { item: PlanItem; onClose: () => void; onSwitchToActions: () => void }) {
  const { profile } = useAuth();
  const addComment = useAddComment();
  const [body, setBody] = useState('');

  const submit = () => {
    if (!body.trim()) return;
    addComment.mutate(
      { item, body: body.trim(), author: profile?.name || 'Me' },
      {
        onSuccess: () => { setBody(''); onClose(); },
        onError: (e) => Alert.alert("Couldn't save comment", String((e as Error).message)),
      }
    );
  };

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={item.title}
      subtitle={`${item.kind.charAt(0).toUpperCase() + item.kind.slice(1)}${item.subtitle ? ` · ${item.subtitle}` : ''}`}
    >
      {/* Status + scheduled date row */}
      <View style={styles.detailMetaRow}>
        <SeverityChip level={item.status}/>
        {item.date ? (
          <Text style={styles.detailMetaText}>
            {fmtRelativeDate(item.date)}{item.time ? ` · ${item.time}` : ''}
          </Text>
        ) : null}
      </View>

      {/* Quick actions row — Call / WhatsApp / More-actions */}
      <View style={styles.detailActions}>
        {item.phone ? (
          <DetailActionPill icon={<Phone size={18} color={colors.brand}/>}        label="Call"      onPress={() => callPhone(item.phone || '')}/>
        ) : null}
        {item.phone ? (
          <DetailActionPill icon={<MessageSquare size={18} color={colors.brand}/>} label="WhatsApp" onPress={() => openWhatsApp(item.phone || '', `Hi ${item.title}`)}/>
        ) : null}
        <DetailActionPill icon={<RotateCcw size={18} color={colors.brand}/>}      label="Actions"   onPress={onSwitchToActions}/>
      </View>

      {/* Notes / comment history */}
      {item.notes ? (
        <View style={styles.detailNotes}>
          <Text style={styles.detailNotesTitle}>NOTES &amp; HISTORY</Text>
          <Text style={styles.detailNotesBody}>{item.notes}</Text>
        </View>
      ) : null}

      {/* Add a comment */}
      <View style={styles.composer}>
        <Text style={styles.composerTitle}>ADD A COMMENT</Text>
        <View style={styles.composerRow}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Add a note for the team…"
            placeholderTextColor={colors.text3}
            style={styles.composerInput}
            multiline
            textAlignVertical="top"
            numberOfLines={3}
          />
        </View>
        <Pressable
          onPress={submit}
          disabled={!body.trim() || addComment.isPending}
          style={({ pressed }) => [
            styles.composerBtn,
            (!body.trim() || addComment.isPending) && styles.composerBtnDisabled,
            pressed && styles.composerBtnPressed,
          ]}
        >
          <Send size={16} color="#fff"/>
          <Text style={styles.composerBtnText}>
            {addComment.isPending ? 'Saving…' : 'Post comment'}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function DetailActionPill({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: colors.brand + '22' }} style={styles.detailPill}>
      {icon}
      <Text style={styles.detailPillLabel}>{label}</Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionSheet — LONG-PRESS → reschedule / mark done / delete actions
// ─────────────────────────────────────────────────────────────────────────────
function ActionSheet({ item, onClose }: { item: PlanItem; onClose: () => void }) {
  const markDone = useMarkActivityDone();
  const reschedule = useReschedule();
  const [showDatePicker, setShowDatePicker] = useState(false);

  const isReschedulable = item.refTable !== 'call_reports';
  const isMarkable = item.refTable === 'activities' && item.status !== 'done';

  const onMarkDone = () => {
    if (!isMarkable) return;
    markDone.mutate(
      { activityId: item.refId },
      {
        onSuccess: onClose,
        onError: (e) => Alert.alert("Couldn't mark done", String((e as Error).message)),
      }
    );
  };

  // Reschedule — picks a date 24h from now as a sensible default; the
  // native picker lets the user override. On web (no native picker), we
  // fall back to a +1-day quick action since the HTML date input is
  // complicated to wire reliably across browsers without an extra dep.
  const onReschedule = () => {
    if (Platform.OS === 'web') {
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const iso = tomorrow.toISOString().slice(0, 10);
      reschedule.mutate(
        { item, newDate: iso },
        {
          onSuccess: () => { Alert.alert('Rescheduled', `Moved to ${fmtRelativeDate(iso)}.`); onClose(); },
          onError:   (e) => Alert.alert("Couldn't reschedule", String((e as Error).message)),
        }
      );
    } else {
      setShowDatePicker(true);
    }
  };

  return (
    <BottomSheet visible onClose={onClose} title="Actions" subtitle={item.title}>
      <View style={{ gap: spacing.xs }}>
        {isReschedulable && (
          <ActionRow
            icon={<RotateCcw size={20} color={colors.brand}/>}
            label="Reschedule"
            sub={Platform.OS === 'web' ? 'Push to tomorrow' : 'Pick a new date'}
            onPress={onReschedule}
            busy={reschedule.isPending}
          />
        )}
        {isMarkable && (
          <ActionRow
            icon={<Check size={20} color={colors.green}/>}
            label="Mark as done"
            sub="Closes the task"
            onPress={onMarkDone}
            busy={markDone.isPending}
          />
        )}
        <ActionRow
          icon={<Trash2 size={20} color={colors.red}/>}
          label="Delete"
          sub="Soft-delete · admin can restore"
          tone="danger"
          // Delete is intentionally disabled in this PR — needs a confirm
          // sheet of its own AND scoping by the existing delete-permission
          // matrix on the web side. Ships in PR #108 alongside the People
          // tab's delete flows.
          onPress={() => Alert.alert('Coming soon', 'Delete will ship in PR #108 with the same role-based confirm flow as the web app.')}
        />
      </View>

      {/* Native date picker only used on Android/iOS */}
      {showDatePicker && Platform.OS !== 'web' && (
        <NativeDatePicker
          initialDate={item.date || new Date().toISOString().slice(0, 10)}
          onPick={(iso) => {
            setShowDatePicker(false);
            reschedule.mutate(
              { item, newDate: iso },
              {
                onSuccess: () => { Alert.alert('Rescheduled', `Moved to ${fmtRelativeDate(iso)}.`); onClose(); },
                onError:   (e) => Alert.alert("Couldn't reschedule", String((e as Error).message)),
              }
            );
          }}
          onCancel={() => setShowDatePicker(false)}
        />
      )}
    </BottomSheet>
  );
}

function ActionRow({ icon, label, sub, onPress, busy, tone }: {
  icon: React.ReactNode; label: string; sub?: string;
  onPress: () => void; busy?: boolean; tone?: 'danger' | 'normal';
}) {
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      android_ripple={{ color: colors.s3 }}
      style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed, busy && { opacity: 0.6 }]}
    >
      <View style={styles.actionRowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionRowLabel, tone === 'danger' && { color: colors.red }]}>{label}</Text>
        {sub ? <Text style={styles.actionRowSub}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

// Lazy-loaded date picker so the web bundle doesn't ship the native module.
function NativeDatePicker({ initialDate, onPick, onCancel }: {
  initialDate: string;
  onPick: (iso: string) => void;
  onCancel: () => void;
}) {
  // Dynamic require so Metro-web doesn't try to resolve this module on
  // platforms where it would explode at bundle time.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const DateTimePicker = require('@react-native-community/datetimepicker').default;
  return (
    <DateTimePicker
      value={new Date(initialDate)}
      mode="date"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      minimumDate={new Date()}
      onChange={(event: any, selected?: Date) => {
        if (event?.type === 'dismissed') { onCancel(); return; }
        if (selected) onPick(selected.toISOString().slice(0, 10));
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  chipsWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },

  list: { paddingBottom: 120 },

  // ── Row ─────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.md,
  },
  rowPressed: { backgroundColor: colors.s2 },
  rowIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.s2,
    alignItems: 'center', justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle:  { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, flex: 1 },
  rowTime:   { fontSize: fontSize.xs, color: colors.text3, marginLeft: spacing.sm },
  rowMeta:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  rowSub:    { fontSize: fontSize.xs, color: colors.text2, flex: 1 },
  rowDate:   { fontSize: 11, color: colors.text3, marginTop: 2 },

  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },

  skeletonWrap: { paddingTop: spacing.md, paddingBottom: spacing.lg },

  // ── DetailSheet ────────────────────────────────
  detailMetaRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  detailMetaText: { fontSize: fontSize.sm, color: colors.text2 },

  detailActions: {
    flexDirection: 'row', gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  detailPill: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.brandLight,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  detailPillLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.brand },

  detailNotes: {
    backgroundColor: colors.s2,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  detailNotesTitle: { fontSize: 10, fontWeight: fontWeight.bold, color: colors.text3, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  detailNotesBody:  { fontSize: fontSize.sm, color: colors.text2, lineHeight: 20 },

  composer: { marginTop: spacing.sm },
  composerTitle: { fontSize: 10, fontWeight: fontWeight.bold, color: colors.text3, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  composerRow: {},
  composerInput: {
    backgroundColor: colors.s2,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 80,
    fontSize: fontSize.md,
    color: colors.text,
  },
  composerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand,
    paddingVertical: 12,
    borderRadius: radii.md,
    marginTop: spacing.md,
  },
  composerBtnDisabled: { opacity: 0.5 },
  composerBtnPressed:  { opacity: 0.9 },
  composerBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.bold },

  // ── ActionSheet ─────────────────────────────────
  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderRadius: radii.md, gap: spacing.md,
  },
  actionRowPressed: { backgroundColor: colors.s2 },
  actionRowIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  actionRowLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semi, color: colors.text },
  actionRowSub:   { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
});
