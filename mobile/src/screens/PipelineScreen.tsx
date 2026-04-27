// PipelineScreen — horizontal-swipe Kanban for deals.
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the PR #103 stub. Layout:
//
//   ┌─ GradientHeader: Pipeline · ₹X.XCr open · NN deals
//   ├─ Stage chip strip:  Prospect • Qualified • Demo • Proposal • Negot. • Won • Lost
//   │     (taps jump the column carousel; the active column is highlighted)
//   ├─ Horizontal-paged FlatList of stage columns
//   │   ┌─ stage column ──────────────────┐
//   │   │ Stage header (color bar + count) │
//   │   │ ┌── deal card (vertical list) ──┐
//   │   │ │ company / title               │
//   │   │ │ ₹value · close date · pill    │
//   │   │ │ Back / Advance buttons        │
//   │   │ └─                              ┘
//   │   └─                                ┘
//   └─ FAB stays the same.
//
// Why horizontal paging instead of side-by-side columns: portrait mobile
// can't fit 7 columns. The standard Trello / Asana mobile pattern is one
// column at a time with horizontal swipe between them, which matches the
// brief ("mobile pipeline kanban").
//
// Why explicit Back/Advance buttons instead of swipe-to-move: the outer
// horizontal pager already owns horizontal pan, and nesting a second
// horizontal swipe (per-card stage move) is fragile + accident-prone.
// Buttons are unambiguous; the bottom sheet's stage picker also lets the
// user jump directly to any stage (not just neighbors).

import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  Dimensions, RefreshControl, Alert,
} from 'react-native';
import {
  TrendingUp, ChevronLeft, ArrowRight, Calendar,
  CheckCircle2, XCircle, Sparkles,
} from 'lucide-react-native';
import {
  GradientHeader, EmptyState, SkeletonRow, BottomSheet,
} from '@/components/ui';
import { colors, fontSize, fontWeight, spacing, radii } from '@/theme';
import { useOpportunities, useUpdateOppStage, type Opportunity, type Stage } from '@/hooks/useOpportunities';

const SCREEN_W = Dimensions.get('window').width;

// Compact INR currency formatter — "₹1.20Cr" / "₹4.5L" / "₹35,000".
function fmtINR(n: number): string {
  if (!n) return '₹0';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function fmtRelativeClose(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Math.floor((d.getTime() - Date.now()) / 86400000);
  if (diff < 0) return `${-diff}d overdue`;
  if (diff === 0) return 'today';
  if (diff < 7)  return `in ${diff}d`;
  if (diff < 30) return `in ${Math.round(diff / 7)}w`;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export function PipelineScreen() {
  const { data, isLoading, refetch, isRefetching } = useOpportunities();
  const updateStage = useUpdateOppStage();

  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<FlatList<Stage>>(null);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);

  const stages = data?.stages || [];
  const totalOpenValue = useMemo(() => {
    if (!data) return 0;
    return data.stages
      .filter(s => s.kind === 'open')
      .reduce((sum, s) => sum + (data.totalsByStage[s.name]?.value || 0), 0);
  }, [data]);
  const totalOpenCount = useMemo(() => {
    if (!data) return 0;
    return data.stages
      .filter(s => s.kind === 'open')
      .reduce((sum, s) => sum + (data.totalsByStage[s.name]?.count || 0), 0);
  }, [data]);

  const goToStage = (idx: number) => {
    setActiveIdx(idx);
    listRef.current?.scrollToIndex({ index: idx, animated: true });
  };

  const onMomentumEnd = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (idx !== activeIdx) setActiveIdx(idx);
  };

  // Stage advance — picks the NEXT open stage in the master list.
  const moveStage = (opp: Opportunity, direction: 'forward' | 'back') => {
    const order = stages.map(s => s.name);
    const current = order.indexOf(opp.stage);
    if (current < 0) return;
    const target = direction === 'forward' ? current + 1 : current - 1;
    if (target < 0 || target >= order.length) return;
    const nextStage = stages[target];
    const nextProb = nextStage.probability;
    updateStage.mutate(
      { id: opp.id, stage: nextStage.name, probability: nextProb },
      {
        onError: (e) => Alert.alert("Couldn't move deal", String((e as Error).message)),
      }
    );
    setSelectedOpp(prev => (prev?.id === opp.id ? { ...prev, stage: nextStage.name, probability: nextProb } : prev));
  };

  return (
    <View style={styles.root}>
      <GradientHeader
        title="Pipeline"
        subtitle={
          isLoading ? 'Loading deals…'
          : `${fmtINR(totalOpenValue)} open · ${totalOpenCount} deal${totalOpenCount === 1 ? '' : 's'}`
        }
      />

      {/* Stage chip strip */}
      <View style={styles.chipStripWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipStrip}
        >
          {stages.map((s, i) => {
            const totals = data?.totalsByStage[s.name] || { count: 0, value: 0 };
            const active = i === activeIdx;
            return (
              <Pressable
                key={s.name}
                onPress={() => goToStage(i)}
                style={[styles.chip, active && { backgroundColor: s.color, borderColor: s.color }]}
              >
                <View style={[styles.chipDot, { backgroundColor: active ? '#fff' : s.color }]}/>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.name}</Text>
                <View style={[styles.chipBadge, active && styles.chipBadgeActive]}>
                  <Text style={[styles.chipBadgeText, active && styles.chipBadgeTextActive]}>
                    {totals.count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonRow/>
          <SkeletonRow/>
          <SkeletonRow/>
        </View>
      ) : stages.length === 0 ? (
        <EmptyState
          icon={<TrendingUp size={28} color={colors.brand}/>}
          title="No pipeline stages configured"
          sub="Ask an admin to set up stages in Masters → Pipeline Stages on the web app."
        />
      ) : (
        <FlatList
          ref={listRef}
          data={stages}
          keyExtractor={(s) => s.name}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          getItemLayout={(_, idx) => ({ length: SCREEN_W, offset: SCREEN_W * idx, index: idx })}
          renderItem={({ item: stage, index }) => (
            <StageColumn
              stage={stage}
              opps={data?.byStage[stage.name] || []}
              totals={data?.totalsByStage[stage.name] || { count: 0, value: 0 }}
              onCardPress={(opp) => setSelectedOpp(opp)}
              onAdvance={(opp) => moveStage(opp, 'forward')}
              onRegress={(opp) => moveStage(opp, 'back')}
              isFirstStage={index === 0}
              isLastStage={index === stages.length - 1}
              refreshing={!!isRefetching}
              onRefresh={refetch}
            />
          )}
        />
      )}

      <DealDetailSheet
        opp={selectedOpp}
        stages={stages}
        onClose={() => setSelectedOpp(null)}
        onAdvance={(opp) => moveStage(opp, 'forward')}
        onRegress={(opp) => moveStage(opp, 'back')}
        onPickStage={(opp, stage) => {
          updateStage.mutate(
            { id: opp.id, stage: stage.name, probability: stage.probability },
            { onError: (e) => Alert.alert("Couldn't move deal", String((e as Error).message)) }
          );
          setSelectedOpp({ ...opp, stage: stage.name, probability: stage.probability });
        }}
      />
    </View>
  );
}

// ─────────────── Stage Column ───────────────

function StageColumn({
  stage, opps, totals, onCardPress, onAdvance, onRegress,
  isFirstStage, isLastStage, refreshing, onRefresh,
}: {
  stage: Stage;
  opps: Opportunity[];
  totals: { count: number; value: number };
  onCardPress: (opp: Opportunity) => void;
  onAdvance: (opp: Opportunity) => void;
  onRegress: (opp: Opportunity) => void;
  isFirstStage: boolean;
  isLastStage: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <View style={[styles.column, { width: SCREEN_W }]}>
      {/* Stage header */}
      <View style={[styles.columnHead, { borderLeftColor: stage.color }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.columnTitle}>{stage.name}</Text>
          <Text style={styles.columnMeta}>
            {totals.count} deal{totals.count === 1 ? '' : 's'} · {fmtINR(totals.value)}
          </Text>
        </View>
        <View style={[styles.columnPercent, { backgroundColor: stage.color + '22' }]}>
          <Text style={[styles.columnPercentText, { color: stage.color }]}>{stage.probability}%</Text>
        </View>
      </View>

      {opps.length === 0 ? (
        <EmptyState
          icon={
            stage.kind === 'won'  ? <CheckCircle2 size={28} color={colors.green}/>
          : stage.kind === 'lost' ? <XCircle size={28} color={colors.red}/>
          : <TrendingUp size={28} color={colors.brand}/>
          }
          title={stage.kind === 'won' ? 'No deals closed yet' : stage.kind === 'lost' ? 'Nothing here — congrats' : `No deals in ${stage.name}`}
          sub={
            stage.kind === 'open'
              ? `Move a deal forward from the previous stage, or create one in the web app.`
              : stage.kind === 'won'
                ? 'Deals will land here when you close them.'
                : 'Deals you mark as lost will appear here.'
          }
        />
      ) : (
        <FlatList
          data={opps}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.cardList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand}/>}
          renderItem={({ item }) => (
            <DealCard
              opp={item}
              stageColor={stage.color}
              onPress={() => onCardPress(item)}
              onAdvance={isLastStage ? undefined : () => onAdvance(item)}
              onRegress={isFirstStage ? undefined : () => onRegress(item)}
            />
          )}
        />
      )}
    </View>
  );
}

// ─────────────── Deal Card ───────────────

function DealCard({ opp, stageColor, onPress, onAdvance, onRegress }: {
  opp: Opportunity;
  stageColor: string;
  onPress: () => void;
  onAdvance?: () => void;
  onRegress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.s3 }}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={[styles.cardStripe, { backgroundColor: stageColor }]}/>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{opp.title || 'Deal'}</Text>

        <View style={styles.cardMetaRow}>
          <Text style={styles.cardValue}>{fmtINR(Number(opp.value) || 0)}</Text>
          {opp.close_date ? (
            <View style={styles.cardCloseRow}>
              <Calendar size={11} color={colors.text3}/>
              <Text style={styles.cardCloseText}>{fmtRelativeClose(opp.close_date)}</Text>
            </View>
          ) : null}
        </View>

        {opp.next_step ? (
          <Text style={styles.cardNext} numberOfLines={1}>
            <Text style={{ fontWeight: fontWeight.semi as any }}>Next: </Text>{opp.next_step}
          </Text>
        ) : null}

        {/* Stage-move buttons — back & forward arrows. Hidden when at the
            edges of the stage list. */}
        <View style={styles.cardFootRow}>
          <Pressable
            onPress={(e) => { e.stopPropagation(); onRegress?.(); }}
            disabled={!onRegress}
            hitSlop={6}
            style={[styles.stageBtn, !onRegress && styles.stageBtnDisabled]}
          >
            <ChevronLeft size={16} color={onRegress ? colors.text2 : colors.text3}/>
            <Text style={[styles.stageBtnText, !onRegress && styles.stageBtnTextDisabled]}>Back</Text>
          </Pressable>
          <Pressable
            onPress={(e) => { e.stopPropagation(); onAdvance?.(); }}
            disabled={!onAdvance}
            hitSlop={6}
            style={[styles.stageBtnPrimary, !onAdvance && styles.stageBtnDisabled]}
          >
            <Text style={[styles.stageBtnPrimaryText, !onAdvance && styles.stageBtnTextDisabled]}>Advance</Text>
            <ArrowRight size={14} color={onAdvance ? '#fff' : colors.text3}/>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

// ─────────────── Deal Detail Sheet ───────────────

function DealDetailSheet({
  opp, stages, onClose, onAdvance, onRegress, onPickStage,
}: {
  opp: Opportunity | null;
  stages: Stage[];
  onClose: () => void;
  onAdvance: (opp: Opportunity) => void;
  onRegress: (opp: Opportunity) => void;
  onPickStage: (opp: Opportunity, stage: Stage) => void;
}) {
  if (!opp) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;
  const currentStage = stages.find(s => s.name === opp.stage);

  return (
    <BottomSheet
      visible={!!opp}
      onClose={onClose}
      title={opp.title || 'Deal'}
      subtitle={`${currentStage?.name || opp.stage} · ${fmtINR(Number(opp.value) || 0)}`}
    >
      <View style={detailStyles.head}>
        <View style={[detailStyles.stageBadge, { backgroundColor: (currentStage?.color || colors.brand) + '22' }]}>
          <View style={[detailStyles.stageDot, { backgroundColor: currentStage?.color || colors.brand }]}/>
          <Text style={[detailStyles.stageBadgeText, { color: currentStage?.color || colors.brand }]}>
            {opp.stage} · {opp.probability ?? currentStage?.probability ?? 0}%
          </Text>
        </View>
      </View>

      {/* Quick stats */}
      <View style={detailStyles.statsRow}>
        <Stat label="Value" value={fmtINR(Number(opp.value) || 0)}/>
        <Stat label="Close"  value={opp.close_date ? fmtRelativeClose(opp.close_date) : '—'}/>
        <Stat label="Prob."  value={`${opp.probability ?? 0}%`}/>
      </View>

      {opp.next_step ? (
        <View style={detailStyles.nextBox}>
          <Sparkles size={14} color={colors.brand}/>
          <Text style={detailStyles.nextText}>{opp.next_step}</Text>
        </View>
      ) : null}

      {opp.notes ? (
        <View style={detailStyles.notesBox}>
          <Text style={detailStyles.notesLabel}>Notes</Text>
          <Text style={detailStyles.notesText} numberOfLines={6}>{opp.notes}</Text>
        </View>
      ) : null}

      {/* Move stage */}
      <Text style={detailStyles.sectionTitle}>Change stage</Text>
      <View style={detailStyles.stagePickRow}>
        {stages.map(s => {
          const active = s.name === opp.stage;
          return (
            <Pressable
              key={s.name}
              onPress={() => onPickStage(opp, s)}
              style={[
                detailStyles.stagePick,
                active && { backgroundColor: s.color, borderColor: s.color },
              ]}
            >
              <View style={[detailStyles.stagePickDot, { backgroundColor: active ? '#fff' : s.color }]}/>
              <Text style={[detailStyles.stagePickText, active && detailStyles.stagePickTextActive]}>{s.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Quick advance / regress */}
      <View style={detailStyles.actionRow}>
        <Pressable
          onPress={() => onRegress(opp)}
          style={detailStyles.secondaryAction}
        >
          <ChevronLeft size={16} color={colors.text2}/>
          <Text style={detailStyles.secondaryActionText}>Back a stage</Text>
        </Pressable>
        <Pressable
          onPress={() => onAdvance(opp)}
          style={detailStyles.primaryAction}
        >
          <Text style={detailStyles.primaryActionText}>Advance</Text>
          <ArrowRight size={16} color="#fff"/>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={detailStyles.stat}>
      <Text style={detailStyles.statLabel}>{label}</Text>
      <Text style={detailStyles.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─────────────── Styles ───────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  chipStripWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  chipStrip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.border,
  },
  chipDot:    { width: 8, height: 8, borderRadius: 4 },
  chipText:   { fontSize: fontSize.xs, fontWeight: fontWeight.semi, color: colors.text2 },
  chipTextActive: { color: '#fff' },
  chipBadge: {
    minWidth: 22, height: 18, borderRadius: 9,
    paddingHorizontal: 6,
    backgroundColor: colors.s3,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 2,
  },
  chipBadgeActive:    { backgroundColor: 'rgba(255,255,255,0.25)' },
  chipBadgeText:      { fontSize: 10, fontWeight: fontWeight.bold, color: colors.text2 },
  chipBadgeTextActive:{ color: '#fff' },

  // Column
  column: { flex: 1 },
  columnHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderLeftWidth: 4,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  columnTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  columnMeta:  { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  columnPercent: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radii.pill,
  },
  columnPercentText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },

  // Card list
  cardList: { padding: spacing.lg, paddingBottom: 120 },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#0D1F2D',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  cardPressed: { opacity: 0.85 },
  cardStripe: { width: 4 },
  cardBody:   { flex: 1, padding: spacing.md },
  cardTitle:  { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  cardMetaRow:{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: spacing.sm },
  cardValue:  { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.brand },
  cardCloseRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardCloseText:{ fontSize: 11, color: colors.text3 },
  cardNext:    { fontSize: fontSize.xs, color: colors.text2, marginTop: 6 },

  cardFootRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  stageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    backgroundColor: colors.s2,
    borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border,
  },
  stageBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semi, color: colors.text2 },
  stageBtnDisabled:    { opacity: 0.4 },
  stageBtnTextDisabled:{ color: colors.text3 },
  stageBtnPrimary: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.brand,
    borderRadius: radii.md,
  },
  stageBtnPrimaryText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#fff' },
});

const detailStyles = StyleSheet.create({
  head: { marginBottom: spacing.md, alignItems: 'flex-start' },
  stageBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radii.pill,
  },
  stageDot:        { width: 8, height: 8, borderRadius: 4 },
  stageBadgeText:  { fontSize: fontSize.xs, fontWeight: fontWeight.bold },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  stat: {
    flex: 1,
    backgroundColor: colors.s2,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  statLabel: { fontSize: 10, color: colors.text3, fontWeight: fontWeight.semi, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: fontSize.md, color: colors.text, fontWeight: fontWeight.bold, marginTop: 2 },

  nextBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.brandLight,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.brand + '22',
  },
  nextText: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.semi },

  notesBox: {
    backgroundColor: colors.s2,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  notesLabel: { fontSize: 11, color: colors.text3, fontWeight: fontWeight.bold, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  notesText:  { fontSize: fontSize.sm, color: colors.text2, lineHeight: 20 },

  sectionTitle: {
    fontSize: fontSize.xs, fontWeight: fontWeight.bold,
    color: colors.text3, letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: spacing.sm, marginTop: spacing.sm,
  },

  stagePickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stagePick: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.border,
  },
  stagePickDot: { width: 8, height: 8, borderRadius: 4 },
  stagePickText:      { fontSize: fontSize.xs, fontWeight: fontWeight.semi, color: colors.text2 },
  stagePickTextActive:{ color: '#fff' },

  actionRow: {
    flexDirection: 'row', gap: spacing.sm,
    marginTop: spacing.lg,
  },
  secondaryAction: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    backgroundColor: colors.s2,
    borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border,
  },
  secondaryActionText: { fontSize: fontSize.sm, fontWeight: fontWeight.semi, color: colors.text2 },
  primaryAction: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12,
    backgroundColor: colors.brand,
    borderRadius: radii.md,
  },
  primaryActionText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: '#fff' },
});
