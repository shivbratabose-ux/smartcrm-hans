// LoginScreen — PR #103 polished version.
// ─────────────────────────────────────────────────────────────────────────────
// Visuals:
//   - Brand-deep gradient background (#0D3830 → #1B6B5A) — gives the screen
//     a hero feel without an illustration asset
//   - Floating-card form with elevation, no border
//   - Clean inputs with leading icons (no chrome)
//   - "Remember device" toggle (currently informational — Supabase already
//     persists the session via AsyncStorage; the toggle simply gives the
//     user reassurance and is wired for future biometric-lock work)
//   - Email-OTP fallback toggle (works today; SMS one-line swap when
//     Twilio is configured)
import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, Lock, Send, ShieldCheck } from 'lucide-react-native';
import { useAuth } from './AuthContext';
import { colors, spacing, radii, fontSize, fontWeight, gradients, elevation } from '@/theme';

type Mode = 'password' | 'otp';

export function LoginScreen() {
  const { signIn, signInWithOtp } = useAuth();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [remember, setRemember] = useState(true);

  const submit = async () => {
    setError('');
    setBusy(true);
    if (mode === 'password') {
      const { error: e } = await signIn(email.trim().toLowerCase(), password);
      if (e) setError(e);
    } else {
      const { error: e } = await signInWithOtp(email.trim().toLowerCase());
      if (e) setError(e); else setOtpSent(true);
    }
    setBusy(false);
  };

  const canSubmit = mode === 'password'
    ? !!email.trim() && password.length >= 6 && !busy
    : !!email.trim() && !busy;

  return (
    <LinearGradient
      colors={gradients.brandDeep as any}
      start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
      style={styles.root}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand mark — replace with PNG once design ships logo asset */}
          <View style={styles.brandStrip}>
            <View style={styles.brandLogo}>
              <Text style={styles.brandLogoText}>S</Text>
            </View>
            <Text style={styles.brandTitle}>SmartCRM</Text>
            <Text style={styles.brandSub}>Hans Infomatic</Text>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            <Text style={styles.heading}>Sign in</Text>
            <Text style={styles.headingSub}>
              {mode === 'password'
                ? 'Use the same email + password as the web app.'
                : 'We\'ll email you a one-time link to sign in.'}
            </Text>

            <View style={styles.field}>
              <Mail size={18} color={colors.text3} style={styles.fieldIcon}/>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="email@company.com"
                placeholderTextColor={colors.text3}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                inputMode="email"
                textContentType="emailAddress"
              />
            </View>

            {mode === 'password' && (
              <View style={styles.field}>
                <Lock size={18} color={colors.text3} style={styles.fieldIcon}/>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={colors.text3}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="password"
                />
              </View>
            )}

            {/* Remember device toggle */}
            {mode === 'password' && (
              <View style={styles.rememberRow}>
                <View style={styles.rememberLeft}>
                  <ShieldCheck size={16} color={colors.brand}/>
                  <Text style={styles.rememberLabel}>Remember this device</Text>
                </View>
                <Switch
                  value={remember}
                  onValueChange={setRemember}
                  trackColor={{ false: colors.border, true: colors.brand }}
                  thumbColor={'#fff'}
                />
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {otpSent && mode === 'otp' ? (
              <View style={styles.success}>
                <Text style={styles.successText}>
                  ✓ Check your inbox — open the link to sign in.
                </Text>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, !canSubmit && styles.btnDisabled]}
                onPress={canSubmit ? submit : undefined}
              >
                {busy
                  ? <ActivityIndicator color="#fff"/>
                  : <View style={styles.btnInner}>
                      <Send size={16} color="#fff"/>
                      <Text style={styles.btnText}>
                        {mode === 'password' ? 'Sign in' : 'Email me a sign-in link'}
                      </Text>
                    </View>
                }
              </Pressable>
            )}

            <Pressable
              onPress={() => { setMode(m => m === 'password' ? 'otp' : 'password'); setError(''); setOtpSent(false); }}
              style={styles.toggleWrap}
            >
              <Text style={styles.toggleText}>
                {mode === 'password' ? 'Use email link instead' : 'Use password instead'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.footnote}>
            Forgot your password? Ask an admin to reset it from the web app.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xxxl },

  brandStrip: { alignItems: 'center', paddingBottom: spacing.xxxl },
  brandLogo: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  brandLogoText: { color: '#fff', fontSize: 28, fontWeight: fontWeight.heavy },
  brandTitle:    { color: '#fff', fontSize: fontSize.xxl, fontWeight: fontWeight.heavy, letterSpacing: 0.5 },
  brandSub:      { color: 'rgba(255,255,255,0.72)', fontSize: fontSize.sm, marginTop: 4 },

  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.xl,
    borderRadius: radii.xl,
    padding: spacing.xxl,
    ...elevation.lg,
  },
  heading:    { fontSize: fontSize.xl, fontWeight: fontWeight.heavy, color: colors.text },
  headingSub: { fontSize: fontSize.sm, color: colors.text3, marginTop: spacing.xs, marginBottom: spacing.lg },

  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.s2,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 52,
    marginBottom: spacing.md,
  },
  fieldIcon: { marginRight: spacing.sm },
  input: { flex: 1, color: colors.text, fontSize: fontSize.md },

  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  rememberLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rememberLabel: { fontSize: fontSize.sm, color: colors.text2, fontWeight: fontWeight.semi },

  error: { color: colors.red, fontSize: fontSize.xs, marginTop: -spacing.xs, marginBottom: spacing.sm },
  success: {
    backgroundColor: colors.greenBg,
    padding: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
  successText: { color: colors.green, fontSize: fontSize.sm, lineHeight: 20 },

  btn: {
    backgroundColor: colors.brand,
    paddingVertical: 14,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
  btnInner:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  btnPressed:  { opacity: 0.9 },
  btnDisabled: { backgroundColor: colors.text3 },
  btnText:     { color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.bold },

  toggleWrap: { alignItems: 'center', marginTop: spacing.lg, paddingVertical: spacing.xs },
  toggleText: { color: colors.brand, fontSize: fontSize.sm, fontWeight: fontWeight.semi },

  footnote: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
});
