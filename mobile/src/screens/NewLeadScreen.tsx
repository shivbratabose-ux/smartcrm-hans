import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Alert, Pressable } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { colors, spacing, radii, fontSize } from '@/theme';
import { PrimaryButton } from '@/components/PrimaryButton';
import { requireSupabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';

type Props = { onBack: () => void };

const STAGE_OPTIONS = ['MQL', 'SQL', 'SAL', 'Converted', 'NA'];

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])([a-z'.-]*)/g, (_m, a, b) => a.toUpperCase() + b);

export function NewLeadScreen({ onBack }: Props) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState('MQL');

  const canSubmit = company.trim().length > 1 && (email.trim() || phone.trim());

  const submit = async () => {
    setBusy(true);
    try {
      const sb = requireSupabase();
      // Lead ID is auto-generated server-side by the web app's auto-id
      // effect (PR #100). For mobile inserts we send `lead_id: null` and
      // the next time someone opens the web app's Leads page, the effect
      // assigns a real FL-YYYY-NNN id. Cleaner alternative would be a
      // server-side trigger; that's a Phase-2 cleanup.
      const { error } = await sb.from('leads').insert({
        company: company.trim().toUpperCase(),  // PR #98 ALL CAPS policy
        contact_name: contact.trim() ? titleCase(contact.trim()) : null,
        email: email.trim().toLowerCase() || null,
        phone: phone.trim().replace(/\s+/g, ' ') || null,
        stage,
        owner: profile?.id || null,
        score: 30,
        is_deleted: false,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['leads'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      onBack();
    } catch (e) {
      Alert.alert("Couldn't save lead", String((e as Error).message));
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
        <Text style={styles.headerTitle}>New Lead</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Field label="Company Name * (ALL CAPS)" value={company} onChange={(v) => setCompany(v.toUpperCase())} style={{ textTransform: 'uppercase' }}/>
        <Field label="Contact Person" value={contact} onChange={(v) => setContact(titleCase(v))} style={{ textTransform: 'capitalize' }}/>
        <Field label="Email" value={email} onChange={(v) => setEmail(v.toLowerCase())} keyboardType="email-address" style={{ textTransform: 'lowercase' }}/>
        <Field label="Phone" value={phone} onChange={setPhone} keyboardType="phone-pad"/>

        <Text style={styles.section}>Stage</Text>
        <View style={styles.stageRow}>
          {STAGE_OPTIONS.map(s => (
            <Pressable
              key={s}
              style={[styles.stageBtn, stage === s && styles.stageBtnActive]}
              onPress={() => setStage(s)}
            >
              <Text style={[styles.stageBtnText, stage === s && styles.stageBtnTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ height: spacing.lg }}/>
        <PrimaryButton title={busy ? 'Saving…' : 'Create Lead'} loading={busy} disabled={!canSubmit} onPress={submit}/>
        <View style={{ height: spacing.md }}/>
        <PrimaryButton variant="secondary" title="Cancel" onPress={onBack}/>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, keyboardType, style }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  style?: object;
}) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        style={[fieldStyles.input, style]}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={false}
      />
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
  headerTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginLeft: spacing.sm },
  scroll: { padding: spacing.xl },

  section: {
    fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5,
    textTransform: 'uppercase', color: colors.text3,
    marginTop: spacing.md, marginBottom: spacing.sm,
  },
  stageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stageBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.border,
  },
  stageBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  stageBtnText: { color: colors.text2, fontSize: fontSize.sm, fontWeight: '600' },
  stageBtnTextActive: { color: '#fff' },
});

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: fontSize.xs, color: colors.text2, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.md, color: colors.text,
  },
});
