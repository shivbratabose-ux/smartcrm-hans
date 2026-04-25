import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, TextInput, Alert,
} from 'react-native';
import { Phone, Mail, MessageSquare, ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radii, fontSize } from '@/theme';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useLead, useUpdateLead } from '@/hooks/useLeads';
import { callPhone, openWhatsApp, openEmail } from '@/utils/dial';
import { fmtRelativeDate } from '@/utils/format';

const STAGE_OPTIONS = ['MQL', 'SQL', 'SAL', 'Converted', 'NA'];

type Props = {
  leadId: string;
  onBack: () => void;
};

export function LeadDetailScreen({ leadId, onBack }: Props) {
  const { data: lead, isLoading } = useLead(leadId);
  const updateLead = useUpdateLead();
  const [stage, setStage] = useState<string>('');
  const [nextCall, setNextCall] = useState<string>('');
  const [note, setNote] = useState<string>('');

  useEffect(() => {
    if (lead) {
      setStage(lead.stage || '');
      setNextCall(lead.next_call || '');
    }
  }, [lead?.id, lead?.stage, lead?.next_call]);

  if (isLoading || !lead) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header onBack={onBack} title="Lead"/>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  const contact = lead.contact_name || lead.contact || '';

  const saveStage = (next: string) => {
    setStage(next);
    updateLead.mutate({ id: lead.id, patch: { stage: next } });
  };

  const saveNote = () => {
    if (!note.trim()) return;
    // Append the new note to whatever's already there with a date stamp.
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const merged = [lead.notes || '', `[${stamp}] ${note.trim()}`].filter(Boolean).join('\n');
    updateLead.mutate(
      { id: lead.id, patch: { notes: merged } },
      {
        onSuccess: () => { setNote(''); },
        onError: (e) => Alert.alert('Couldn\'t save note', String((e as Error).message)),
      }
    );
  };

  const saveNextCall = () => {
    if (!nextCall || nextCall === lead.next_call) return;
    updateLead.mutate({ id: lead.id, patch: { next_call: nextCall } });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Header onBack={onBack} title={lead.lead_id || 'Lead'}/>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.company} numberOfLines={2}>{lead.company || '—'}</Text>
        <Text style={styles.contact}>
          {contact}{lead.designation ? ` · ${lead.designation}` : ''}
        </Text>

        {/* ── Quick contact actions ── */}
        <View style={styles.actionsRow}>
          {lead.phone ? (
            <ActionPill icon={<Phone size={18} color={colors.brand}/>}    label="Call"  onPress={() => callPhone(lead.phone || '')}/>
          ) : null}
          {lead.phone ? (
            <ActionPill icon={<MessageSquare size={18} color={colors.brand}/>} label="WhatsApp" onPress={() => openWhatsApp(lead.phone || '', `Hi ${contact || ''}`)}/>
          ) : null}
          {lead.email ? (
            <ActionPill icon={<Mail size={18} color={colors.brand}/>}     label="Email" onPress={() => openEmail(lead.email || '', `Re: ${lead.company || 'our conversation'}`)}/>
          ) : null}
        </View>

        {/* ── Stage update ── */}
        <Text style={styles.section}>Stage</Text>
        <View style={styles.stageRow}>
          {STAGE_OPTIONS.map(s => (
            <Pressable
              key={s}
              style={[styles.stageBtn, stage === s && styles.stageBtnActive]}
              onPress={() => saveStage(s)}
            >
              <Text style={[styles.stageBtnText, stage === s && styles.stageBtnTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Next call date ── */}
        <Text style={styles.section}>Next follow-up</Text>
        <View style={styles.field}>
          <TextInput
            style={styles.input}
            value={nextCall}
            onChangeText={setNextCall}
            onBlur={saveNextCall}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.text3}
          />
          <Text style={styles.fieldHint}>{nextCall ? fmtRelativeDate(nextCall) : 'No follow-up set'}</Text>
        </View>

        {/* ── Add a remark ── */}
        <Text style={styles.section}>Add a remark</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={note}
          onChangeText={setNote}
          placeholder="What happened on the last call / meeting?"
          placeholderTextColor={colors.text3}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <PrimaryButton title={updateLead.isPending ? 'Saving…' : 'Save remark'} loading={updateLead.isPending} disabled={!note.trim()} onPress={saveNote}/>

        {/* ── History ── */}
        {lead.notes ? (
          <>
            <Text style={styles.section}>History</Text>
            <View style={styles.historyBox}>
              <Text style={styles.historyText}>{lead.notes}</Text>
            </View>
          </>
        ) : null}

        <View style={{ height: spacing.xxl }}/>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.header}>
      <Pressable hitSlop={12} onPress={onBack} style={styles.backBtn}>
        <ChevronLeft size={22} color={colors.brand}/>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

function ActionPill({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.pill} onPress={onPress}>
      <View>{icon}</View>
      <Text style={styles.pillLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginLeft: spacing.sm,
  },
  loadingText: { textAlign: 'center', marginTop: spacing.xxl, color: colors.text3 },

  company: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  contact: { fontSize: fontSize.sm, color: colors.text3, marginTop: 2 },

  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandLight,
    borderRadius: radii.md,
    paddingVertical: 12,
  },
  pillLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand },

  section: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.text3,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },

  stageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stageBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.border,
  },
  stageBtnActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  stageBtnText: { color: colors.text2, fontSize: fontSize.sm, fontWeight: '600' },
  stageBtnTextActive: { color: '#fff' },

  field: {},
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  textarea: {
    minHeight: 96,
    marginBottom: spacing.sm,
  },
  fieldHint: { fontSize: fontSize.xs, color: colors.text3, marginTop: spacing.xs },

  historyBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
  },
  historyText: { color: colors.text2, fontSize: fontSize.sm, lineHeight: 20 },
});
