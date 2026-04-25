// LoginScreen — email + password (matches the web app), with an OTP
// email-magic-link fallback. SMS OTP is a one-line swap when the
// org connects a Twilio account (signInWithOtp({ phone }) instead of
// { email }).
import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  StyleSheet, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { Mail, Lock, Send } from 'lucide-react-native';
import { useAuth } from './AuthContext';
import { colors, spacing, radii, fontSize } from '@/theme';

type Mode = 'password' | 'otp';

export function LoginScreen() {
  const { signIn, signInWithOtp } = useAuth();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [otpSent, setOtpSent] = useState(false);

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
    ? email.trim() && password.length >= 6 && !busy
    : email.trim() && !busy;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.root}
    >
      <View style={styles.brandStrip}>
        {/* Big logo block — gives the screen a clear identity at a glance.
            Using a Text-only mark for now; replace with an Image once the
            real logo asset lands in /assets. */}
        <Text style={styles.brandTitle}>SmartCRM</Text>
        <Text style={styles.brandSub}>Hans Infomatic</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Sign in</Text>
        <Text style={styles.headingSub}>
          {mode === 'password'
            ? 'Use the same email + password as the web app.'
            : 'We’ll email you a one-time link to sign in.'}
        </Text>

        <View style={styles.field}>
          <Mail size={16} color={colors.text3} style={styles.fieldIcon}/>
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
            <Lock size={16} color={colors.text3} style={styles.fieldIcon}/>
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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {otpSent && mode === 'otp' ? (
          <View style={styles.success}>
            <Text style={styles.successText}>
              ✓ Check your inbox for a sign-in link.{'\n'}
              You can close this app — open the link from your email and you'll be signed in.
            </Text>
          </View>
        ) : (
          <Pressable
            style={[styles.btn, !canSubmit && styles.btnDisabled]}
            onPress={canSubmit ? submit : undefined}
          >
            {busy
              ? <ActivityIndicator color="#fff"/>
              : <>
                  <Send size={16} color="#fff" />
                  <Text style={styles.btnText}>
                    {mode === 'password' ? 'Sign in' : 'Email me a sign-in link'}
                  </Text>
                </>
            }
          </Pressable>
        )}

        <Pressable onPress={() => { setMode(m => m === 'password' ? 'otp' : 'password'); setError(''); setOtpSent(false); }}>
          <Text style={styles.toggleText}>
            {mode === 'password'
              ? 'Email me a one-time link instead'
              : 'Use password instead'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.footnote}>
        Forgot your password? Ask an admin to reset it from the web app.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brand,
    justifyContent: 'center',
  },
  brandStrip: {
    paddingTop: 60,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: fontSize.xxl,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  brandSub: {
    color: '#FFFFFFB0',
    fontSize: fontSize.sm,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.xl,
    borderRadius: radii.xl,
    padding: spacing.xxl,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 8,
  },
  heading: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  headingSub: {
    fontSize: fontSize.sm,
    color: colors.text3,
    marginBottom: spacing.lg,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.s2,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 50,
    marginBottom: spacing.md,
  },
  fieldIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
  },
  error: {
    color: colors.red,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
  },
  success: {
    backgroundColor: colors.greenBg,
    padding: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
  successText: {
    color: colors.green,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand,
    paddingVertical: 14,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
  btnDisabled: { backgroundColor: colors.text3 },
  btnText: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  toggleText: {
    color: colors.brand,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.lg,
    fontWeight: '600',
  },
  footnote: {
    color: '#FFFFFF99',
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
});
