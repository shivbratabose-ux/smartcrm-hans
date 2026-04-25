import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Phone, ChevronRight } from 'lucide-react-native';
import { colors, spacing, radii, fontSize } from '@/theme';
import { fmtRelativeDate, isOverdue } from '@/utils/format';
import { callPhone } from '@/utils/dial';
import type { Lead } from '@/hooks/useLeads';

type Props = { lead: Lead; onPress: () => void };

const STAGE_TINT: Record<string, { fg: string; bg: string }> = {
  MQL:  { fg: '#1D4ED8', bg: '#EFF6FF' },
  SQL:  { fg: '#92400E', bg: '#FFFBEB' },
  SAL:  { fg: '#5B21B6', bg: '#EDE9FE' },
  Converted: { fg: '#065F46', bg: '#ECFDF5' },
  NA:   { fg: '#475569', bg: '#F1F5F9' },
};

export function LeadRow({ lead, onPress }: Props) {
  const tint = STAGE_TINT[lead.stage || ''] || STAGE_TINT.NA!;
  const overdue = isOverdue(lead.next_call);
  const contact = lead.contact_name || lead.contact || '—';
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.left}>
        <Text style={styles.company} numberOfLines={1}>{lead.company || '—'}</Text>
        <Text style={styles.contact} numberOfLines={1}>
          {contact}
          {lead.designation ? ` · ${lead.designation}` : ''}
        </Text>
        <View style={styles.metaRow}>
          <View style={[styles.stage, { backgroundColor: tint.bg }]}>
            <Text style={[styles.stageText, { color: tint.fg }]}>{lead.stage || 'NA'}</Text>
          </View>
          {lead.next_call ? (
            <Text style={[styles.next, overdue && styles.nextOverdue]} numberOfLines={1}>
              Next: {fmtRelativeDate(lead.next_call)}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.right}>
        {lead.phone ? (
          <Pressable
            hitSlop={12}
            onPress={(e) => { e.stopPropagation(); callPhone(lead.phone || ''); }}
            style={styles.callBtn}
          >
            <Phone size={18} color={colors.brand}/>
          </Pressable>
        ) : null}
        <ChevronRight size={18} color={colors.text3}/>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  left:  { flex: 1, minWidth: 0 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  company: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  contact: {
    fontSize: fontSize.sm,
    color: colors.text2,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  stage: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  stageText: {
    fontSize: 11,
    fontWeight: '700',
  },
  next: {
    fontSize: fontSize.xs,
    color: colors.text3,
  },
  nextOverdue: {
    color: colors.red,
    fontWeight: '700',
  },
  callBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
});
