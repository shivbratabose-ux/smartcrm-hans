// MoreScreen — hub for less-frequent destinations.
// ─────────────────────────────────────────────────────────────────────────────
// Surfaces:
//   - People (Contacts + Accounts unified search)  ← TODAY: Contacts existing screen
//   - Activity log
//   - Reports                                       ← STUB
//   - Settings                                      ← STUB
//   - Sign out
//
// We use it as the holding area for stuff that doesn't deserve top-level
// real estate but the user still needs to reach.
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import {
  ContactRound, ListChecks, BarChart3, Settings, LogOut, ChevronRight, User,
} from 'lucide-react-native';
import { useAuth } from '@/auth/AuthContext';
import { GradientHeader, Card } from '@/components/ui';
import { colors, fontSize, fontWeight, spacing, radii } from '@/theme';
import { initials } from '@/utils/format';

type Props = {
  onOpenContacts: () => void;
  onOpenLeads: () => void;
};

export function MoreScreen({ onOpenContacts, onOpenLeads }: Props) {
  const { profile, signOut } = useAuth();

  const confirmSignOut = () => {
    Alert.alert(
      'Sign out?',
      'You\'ll need to sign in again next time you open the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => { signOut(); } },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <GradientHeader title="More" subtitle="Settings · People · Reports"/>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile card */}
        <Card padding="md" style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{initials(profile?.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName} numberOfLines={1}>{profile?.name || 'You'}</Text>
              <Text style={styles.profileMeta}  numberOfLines={1}>
                {profile?.email}{profile?.role ? ` · ${profile.role}` : ''}
              </Text>
            </View>
          </View>
        </Card>

        {/* Sections */}
        <Section title="WORKSPACE">
          <Row icon={<ContactRound size={20} color={colors.brand}/>}    label="People" sub="Contacts" onPress={onOpenContacts}/>
          <Row icon={<User size={20} color={colors.brand}/>}             label="Leads"  sub="All assigned leads" onPress={onOpenLeads}/>
          <Row icon={<ListChecks size={20} color={colors.brand}/>}      label="Activity log" sub="See plan tab"  disabled/>
        </Section>

        <Section title="INSIGHTS">
          <Row icon={<BarChart3 size={20} color={colors.text3}/>} label="Reports"   sub="Coming in PR #109" disabled/>
        </Section>

        <Section title="SYSTEM">
          <Row icon={<Settings size={20} color={colors.text3}/>}  label="Settings"  sub="Coming soon" disabled/>
          <Row icon={<LogOut size={20} color={colors.red}/>}      label="Sign out"  sub="" tone="danger" onPress={confirmSignOut}/>
        </Section>

        <Text style={styles.versionTag}>SmartCRM Mobile · v0.4 · PR #107</Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionWrap}>{children}</View>
    </View>
  );
}

function Row({ icon, label, sub, onPress, disabled, tone = 'normal' }: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onPress?: () => void;
  disabled?: boolean;
  tone?: 'normal' | 'danger';
}) {
  const Wrap: React.ComponentType<any> = disabled || !onPress ? View : Pressable;
  const props = disabled || !onPress ? {} : { onPress, android_ripple: { color: colors.s3 } };
  return (
    <Wrap {...props} style={({ pressed }: any) => [styles.row, pressed && styles.rowPressed, disabled && styles.rowDisabled]}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, tone === 'danger' && { color: colors.red }, disabled && { color: colors.text3 }]}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {!disabled && onPress ? <ChevronRight size={18} color={colors.text3}/> : null}
    </Wrap>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },

  profileCard: { marginBottom: spacing.lg },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  profileAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarText: { color: colors.textInv, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  profileName: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  profileMeta: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },

  sectionTitle: {
    fontSize: 11, fontWeight: fontWeight.bold,
    color: colors.text3, letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 4, paddingTop: spacing.lg, paddingBottom: spacing.xs,
  },
  sectionWrap: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: spacing.md, gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.s2 },
  rowDisabled: { opacity: 0.55 },
  rowIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semi, color: colors.text },
  rowSub:  { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },

  versionTag: { textAlign: 'center', color: colors.text3, fontSize: fontSize.xs, marginTop: spacing.xxxl },
});
