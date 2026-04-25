import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Alert, Pressable } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radii, fontSize } from '@/theme';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useCreateContact } from '@/hooks/useContacts';

type Props = { onBack: () => void };

// Per the web app's PR #99 normalisation policy:
//   Person names → Title Case
//   Emails → lowercase
//   Phones → trim + collapse spaces
const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])([a-z'.-]*)/g, (_m, a, b) => a.toUpperCase() + b);

export function NewContactScreen({ onBack }: Props) {
  const create = useCreateContact();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');

  const canSubmit = name.trim().length > 1 && (email.trim() || phone.trim());

  const submit = () => {
    create.mutate(
      {
        contact_id: `CON-${Date.now().toString(36).toUpperCase()}`,
        name: name.trim(),
        email: email.trim().toLowerCase() || null,
        phone: phone.trim().replace(/\s+/g, ' ') || null,
        designation: designation.trim() || null,
        is_deleted: false,
      },
      {
        onSuccess: () => onBack(),
        onError: (e) => Alert.alert("Couldn't save contact", String((e as Error).message)),
      }
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.brand}/>
        </Pressable>
        <Text style={styles.headerTitle}>New Contact</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Field label="Full Name *" value={name}        onChange={(v) => setName(titleCase(v))}/>
        <Field label="Designation" value={designation} onChange={(v) => setDesignation(titleCase(v))}/>
        <Field label="Email" value={email}             onChange={(v) => setEmail(v.toLowerCase())} keyboardType="email-address"/>
        <Field label="Phone" value={phone}             onChange={setPhone} keyboardType="phone-pad"/>

        <View style={{ height: spacing.lg }}/>
        <PrimaryButton
          title={create.isPending ? 'Saving…' : 'Save Contact'}
          loading={create.isPending}
          disabled={!canSubmit}
          onPress={submit}
        />
        <View style={{ height: spacing.md }}/>
        <PrimaryButton variant="secondary" title="Cancel" onPress={onBack}/>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, keyboardType }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
}) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        style={fieldStyles.input}
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
