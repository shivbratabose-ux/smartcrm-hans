// LogCallScreen — capture call outcomes from the field. PR #107.
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors the web QuickLog modal's "Call" tab but trimmed to only the fields
// a salesperson actually fills out from the field on a phone:
//
//   - Call Type        (Telephone / Visit / Web / WhatsApp / Email / LinkedIn)
//   - Outcome          (Completed / No Answer / Rescheduled / Voicemail / Left Message)
//   - Lead OR Account  (typeahead on the lead list — quickest path; account
//                       link is stored implicitly via the lead's account_id)
//   - Notes            (min 10 chars — same validation as web)
//   - Next call date   (optional — date-only, no time picker because field
//                       reps schedule "tomorrow / next week" not exact times)
//   - "Also create follow-up reminder" toggle — when ON, also writes a
//     planned activity row pinned to next_call_date so the Plan tab + push
//     reminder system surface it.
//
// The web modal has 13+ fields. We deliberately strip down to the call-from-
// the-car essentials. Power users can still go to the web app for the long
// form; this screen is for "just got off a call, capture before I forget".
//
// Persistence: writes to public.call_reports (matches the schema in
// supabase/schema.sql:220 — call_date, call_type, marketing_person, lead_name,
// company, account_id, notes, next_call_date, outcome, objective, duration).
// Optional follow-up writes to public.activities.

import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView, Alert, Pressable, Switch,
  Platform,
} from 'react-native';
import { ChevronLeft, Phone, Check, Search, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { colors, spacing, radii, fontSize, fontWeight } from '@/theme';
import { PrimaryButton } from '@/components/PrimaryButton';
import { requireSupabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';
import { useLeads, type Lead } from '@/hooks/useLeads';
import { todayIso } from '@/utils/format';

type Props = {
  onBack: () => void;
  // Optional pre-fill — when LogCall is opened from a Lead detail page we
  // pin it to that lead immediately so the user doesn't have to search again.
  preselectLeadId?: string;
};

const CALL_TYPES   = ['Telephone Call', 'Visit', 'Web Call', 'WhatsApp/Text', 'Email', 'LinkedIn'];
const OUTCOMES     = ['Completed', 'No Answer', 'Rescheduled', 'Voicemail', 'Left Message'];
const DURATIONS    = [5, 15, 30, 45, 60];

export function LogCallScreen({ onBack, preselectLeadId }: Props) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { data: leads = [] } = useLeads();

  const [busy, setBusy]               = useState(false);
  const [callType, setCallType]       = useState<string>('Telephone Call');
  const [outcome, setOutcome]         = useState<string>('Completed');
  const [duration, setDuration]       = useState<number>(15);
  const [callDate]                    = useState<string>(todayIso());      // always today on mobile capture
  const [leadId, setLeadId]           = useState<string>(preselectLeadId || '');
  const [notes, setNotes]             = useState<string>('');
  const [nextCallDate, setNextCallDate] = useState<string>('');
  const [createFollowup, setCreateFollowup] = useState<boolean>(false);

  // Lead picker (typeahead) — only show when no lead is preselected
  const [leadSearch, setLeadSearch]   = useState<string>('');
  const [pickerOpen, setPickerOpen]   = useState<boolean>(false);

  const selectedLead: Lead | undefined = useMemo(
    () => leads.find(l => l.id === leadId),
    [leads, leadId]
  );

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return leads.slice(0, 30);
    return leads
      .filter(l =>
        (l.company || '').toLowerCase().includes(q) ||
        (l.contact_name || '').toLowerCase().includes(q) ||
        (l.lead_id || '').toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [leads, leadSearch]);

  // Validation matches the web QuickLog: notes required + min 10 chars.
  const notesError = notes.trim().length > 0 && notes.trim().length < 10
    ? 'Notes must be at least 10 characters'
    : null;
  const canSubmit = notes.trim().length >= 10 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const sb = requireSupabase();
      const lead = selectedLead;
      const callId = `cr${Date.now().toString(36)}`;

      // 1. Persist the call report
      const callRow = {
        id: callId,
        call_date: callDate,
        call_type: callType,
        marketing_person: profile?.id || null,
        lead_name: lead?.contact_name || lead?.contact || '',
        company: lead?.company || '',
        account_id: lead?.account_id || null,
        notes: notes.trim(),
        next_call_date: nextCallDate || null,
        outcome,
        objective: 'General Followup',     // matches web's default for QuickLog calls
        duration: String(duration),
        lead_stage: lead?.stage || null,
        is_deleted: false,
      };
      const { error: callErr } = await sb.from('call_reports').insert(callRow);
      if (callErr) throw callErr;

      // 2. Roll the lead's last_contact_date forward + bump next_call when set.
      if (lead) {
        const leadPatch: Record<string, any> = {
          last_contact_date: callDate,
          updated_at: new Date().toISOString(),
        };
        if (nextCallDate) leadPatch.next_call = nextCallDate;
        await sb.from('leads').update(leadPatch).eq('id', lead.id);
      }

      // 3. Optional: create a planned follow-up activity so it shows on the
      //    Plan tab + fires the daily 9 AM push reminder.
      if (createFollowup && nextCallDate) {
        const actId = `act${Date.now().toString(36)}`;
        await sb.from('activities').insert({
          id: actId,
          title: `Follow-up: ${lead?.company || lead?.contact_name || 'call'}`,
          type: 'Call',
          status: 'Planned',
          date: nextCallDate,
          time: null,
          duration: 30,
          account_id: lead?.account_id || null,
          contact_id: null,
          owner: profile?.id || null,
          notes: `Follow-up from call on ${callDate}.`,
          is_deleted: false,
        });
      }

      // Refresh anything that might display this on screen
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['today'] }),
        qc.invalidateQueries({ queryKey: ['plan'] }),
        qc.invalidateQueries({ queryKey: ['plan-counts'] }),
        qc.invalidateQueries({ queryKey: ['leads'] }),
        qc.invalidateQueries({ queryKey: ['lead', lead?.id] }),
        qc.invalidateQueries({ queryKey: ['activities'] }),
      ]);

      onBack();
    } catch (e) {
      Alert.alert("Couldn't save call", String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.brand}/>
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.headerTitle}>Log Call</Text>
          <Text style={styles.headerSub}>Capture outcome + next action</Text>
        </View>
        <View style={styles.headerIcon}>
          <Phone size={20} color={colors.brand}/>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Lead picker ── */}
        <Section title="Linked Lead">
          {selectedLead ? (
            <View style={styles.selectedLeadCard}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.selectedLeadCompany} numberOfLines={1}>
                  {selectedLead.company || selectedLead.contact_name || 'Lead'}
                </Text>
                <Text style={styles.selectedLeadMeta} numberOfLines={1}>
                  {selectedLead.contact_name || selectedLead.contact || ''}
                  {selectedLead.lead_id ? ` · ${selectedLead.lead_id}` : ''}
                </Text>
              </View>
              <Pressable hitSlop={8} onPress={() => { setLeadId(''); setPickerOpen(true); }} style={styles.clearBtn}>
                <X size={16} color={colors.text3}/>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.searchBox}>
                <Search size={14} color={colors.text3}/>
                <TextInput
                  style={styles.searchInput}
                  value={leadSearch}
                  onChangeText={(v) => { setLeadSearch(v); setPickerOpen(true); }}
                  onFocus={() => setPickerOpen(true)}
                  placeholder="Search company, contact, or lead ID…"
                  placeholderTextColor={colors.text3}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
              {pickerOpen && (
                <View style={styles.pickerList}>
                  {filteredLeads.length === 0 ? (
                    <Text style={styles.pickerEmpty}>No matching leads</Text>
                  ) : filteredLeads.map(l => (
                    <Pressable
                      key={l.id}
                      style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
                      onPress={() => {
                        setLeadId(l.id);
                        setLeadSearch('');
                        setPickerOpen(false);
                      }}
                    >
                      <Text style={styles.pickerCompany} numberOfLines={1}>
                        {l.company || l.contact_name || 'Lead'}
                      </Text>
                      <Text style={styles.pickerMeta} numberOfLines={1}>
                        {(l.contact_name || l.contact || '—')}{l.lead_id ? ` · ${l.lead_id}` : ''}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <Text style={styles.fieldHint}>
                Optional. Skip to log a quick call without a lead link.
              </Text>
            </>
          )}
        </Section>

        {/* ── Call Type ── */}
        <Section title="Call Type">
          <ChipPick options={CALL_TYPES} value={callType} onChange={setCallType}/>
        </Section>

        {/* ── Outcome ── */}
        <Section title="Outcome">
          <ChipPick options={OUTCOMES} value={outcome} onChange={setOutcome}/>
        </Section>

        {/* ── Duration ── */}
        <Section title="Duration (minutes)">
          <ChipPick
            options={DURATIONS.map(String)}
            value={String(duration)}
            onChange={(v) => setDuration(Number(v))}
          />
        </Section>

        {/* ── Notes ── */}
        <Section title="Discussion Notes" hint="min 10 characters">
          <TextInput
            style={[styles.textarea, notesError && styles.inputError]}
            value={notes}
            onChangeText={setNotes}
            placeholder="What was discussed? Decisions, objections, next steps…"
            placeholderTextColor={colors.text3}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
          {notesError ? <Text style={styles.errorText}>{notesError}</Text> : null}
        </Section>

        {/* ── Next call date ── */}
        <Section title="Next Step / Follow-up Date" hint="Optional">
          <DateField value={nextCallDate} onChange={setNextCallDate}/>
        </Section>

        {/* ── Create follow-up reminder ── */}
        <View style={styles.followupCard}>
          <View style={{ flex: 1, minWidth: 0, marginRight: spacing.md }}>
            <Text style={styles.followupTitle}>Also create reminder</Text>
            <Text style={styles.followupSub}>
              Adds a planned activity for the follow-up date so it shows on the
              Plan tab and the next 9 AM push includes it.
            </Text>
          </View>
          <Switch
            value={createFollowup && !!nextCallDate}
            onValueChange={setCreateFollowup}
            disabled={!nextCallDate}
            trackColor={{ false: colors.s3, true: colors.brand }}
            thumbColor="#fff"
          />
        </View>

        <View style={{ height: spacing.xl }}/>
        <PrimaryButton
          title={busy ? 'Saving…' : 'Save Call'}
          icon={busy ? undefined : <Check size={16} color="#fff"/>}
          loading={busy}
          disabled={!canSubmit}
          onPress={submit}
        />
        <View style={{ height: spacing.md }}/>
        <PrimaryButton variant="secondary" title="Cancel" onPress={onBack}/>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ChipPick({ options, value, onChange }: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map(opt => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// DateField — uses the native picker on iOS/Android, falls back to a plain
// text input on web (matches the pattern PR #105 established for Plan
// reschedule). Renders an inline picker on iOS, modal on Android.
function DateField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [pickerVisible, setPickerVisible] = useState(false);

  const openPicker = () => {
    if (Platform.OS === 'web') return;            // web uses inline text input
    setPickerVisible(true);
  };

  // Lazy-require the native picker so the web bundle doesn't choke trying
  // to resolve a native-only module. See: usePlan.ts uses the same pattern.
  let DateTimePicker: any = null;
  try { DateTimePicker = require('@react-native-community/datetimepicker').default; } catch { /* native-only */ }

  return (
    <View>
      {Platform.OS === 'web' ? (
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.text3}
        />
      ) : (
        <Pressable onPress={openPicker} style={styles.dateBtn}>
          <Text style={[styles.dateBtnText, !value && styles.dateBtnTextEmpty]}>
            {value || 'Tap to pick a date'}
          </Text>
          {value ? (
            <Pressable hitSlop={8} onPress={() => onChange('')}>
              <X size={14} color={colors.text3}/>
            </Pressable>
          ) : null}
        </Pressable>
      )}
      {pickerVisible && DateTimePicker ? (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={new Date()}
          onChange={(_e: any, d: Date | undefined) => {
            setPickerVisible(false);
            if (d) onChange(d.toISOString().slice(0, 10));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  headerSub:   { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  headerIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { padding: spacing.lg, paddingBottom: 80 },

  section: { marginBottom: spacing.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: {
    fontSize: fontSize.xs, fontWeight: fontWeight.bold,
    color: colors.text3, letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionHint: { fontSize: 11, color: colors.text3, fontStyle: 'italic' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.border,
  },
  chipActive:    { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText:      { color: colors.text2, fontSize: fontSize.sm, fontWeight: fontWeight.semi },
  chipTextActive:{ color: '#fff' },

  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.md, color: colors.text,
  },
  textarea: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md, color: colors.text,
    minHeight: 110,
  },
  inputError: { borderColor: colors.red },
  errorText:  { color: colors.red, fontSize: fontSize.xs, marginTop: spacing.xs },

  dateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 14,
  },
  dateBtnText:      { fontSize: fontSize.md, color: colors.text, fontWeight: fontWeight.semi },
  dateBtnTextEmpty: { color: colors.text3, fontWeight: fontWeight.regular },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1, fontSize: fontSize.md, color: colors.text, paddingVertical: 0,
  },

  pickerList: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border,
    maxHeight: 240,
    overflow: 'hidden',
  },
  pickerRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pickerRowPressed: { backgroundColor: colors.s2 },
  pickerCompany: { fontSize: fontSize.sm, fontWeight: fontWeight.semi, color: colors.text },
  pickerMeta:    { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  pickerEmpty:   { textAlign: 'center', color: colors.text3, padding: spacing.md, fontSize: fontSize.sm },

  selectedLeadCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.brandLight,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.brand + '33',
  },
  selectedLeadCompany: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  selectedLeadMeta:    { fontSize: fontSize.xs, color: colors.text2, marginTop: 2 },
  clearBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },

  fieldHint: { fontSize: 11, color: colors.text3, marginTop: spacing.xs, fontStyle: 'italic' },

  followupCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
  },
  followupTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text },
  followupSub:   { fontSize: 11, color: colors.text3, marginTop: 4, lineHeight: 16 },
});
